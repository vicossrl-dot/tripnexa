import {credential} from '../admin/runtime.js';

const API='https://api.viator.com/partner/search/freetext';
const cache=new Map();

const clean=value=>
 String(value||'')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu,'')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g,' ')
  .trim();

const words=value=>
 new Set(
  clean(value)
   .split(/\s+/)
   .filter(word=>word.length>2)
 );

function scoreProduct(product,context){
 const target=clean(context.canonical_place_name);
 const title=clean(product.title);
 const wanted=words(target);
 const found=words(title);

 let score=0;

 if(title===target)score+=150;
 else if(target&&title.includes(target))score+=100;

 if(wanted.size){
  let matches=0;
  for(const word of wanted)
   if(found.has(word))matches++;

  score+=Math.round((matches/wanted.size)*70);
 }

 const city=clean(context.city);

 if(city&&title.includes(city))
  score+=15;

 if(product.productUrl)
  score+=10;

 return score;
}

function putCache(key,value,ttl){
 cache.set(key,{
  expires:Date.now()+ttl,
  value
 });

 while(cache.size>500){
  const first=cache.keys().next().value;
  cache.delete(first);
 }
}

async function apiKey(){
 return credential(
  'VIATOR_API_KEY',
  process.env.VIATOR_API_KEY||''
 );
}

function findProducts(value,depth=0){
 if(!value||depth>5)return [];

 if(Array.isArray(value)){
  const products=value.filter(item=>
   item &&
   typeof item==='object' &&
   item.productCode &&
   item.productUrl
  );

  if(products.length)
   return products;

  for(const item of value){
   const found=findProducts(item,depth+1);
   if(found.length)return found;
  }

  return [];
 }

 if(typeof value==='object'){
  for(const item of Object.values(value)){
   const found=findProducts(item,depth+1);
   if(found.length)return found;
  }
 }

 return [];
}

function language(config){
 const value=String(config.language||'en').trim();

 const supported=new Set([
  'en','en-US','en-AU','en-CA','en-GB','en-HK','en-IE','en-IN',
  'en-MY','en-NZ','en-PH','en-SG','en-ZA',
  'da','nl','nl-BE','no',
  'es','es-AR','es-CL','es-CO','es-MX','es-PE','es-VE',
  'sv','fr','fr-BE','fr-CA','fr-CH',
  'it','it-CH','de','de-DE',
  'pt','pt-BR','ja'
 ]);

 return supported.has(value)?value:'en';
}

function currency(config){
 const value=String(config.currency||'EUR').toUpperCase().trim();
 return /^[A-Z]{3}$/.test(value)?value:'EUR';
}

async function search(query,config,count=25){
 const key=await apiKey();

 if(!key)return {
  products:[],
  configured:false
 };

 const response=await fetch(API,{
  method:'POST',
  headers:{
   Accept:'application/json;version=2.0',
   'Accept-Language':language(config),
   'Content-Type':'application/json',
   'User-Agent':'TripNexa/1.0',
   'exp-api-key':key
  },
  body:JSON.stringify({
   searchTerm:query,
   searchTypes:[
    {
     searchType:'PRODUCTS',
     pagination:{
      start:1,
      count
     }
    }
   ],
   currency:currency(config)
  }),
  signal:AbortSignal.timeout(15000)
 });

 if(!response.ok)
  throw new Error(`Viator API returned HTTP ${response.status}`);

 const data=await response.json();

 return {
  products:findProducts(data),
  configured:true
 };
}

async function fetchProductDetail(product,config){
 if(!product?.productCode)return null;

 const key=await apiKey();
 if(!key)return null;

 const url=new URL(
  `https://api.viator.com/partner/products/${encodeURIComponent(product.productCode)}`
 );

 url.searchParams.set('target-lander','NONE');

 const response=await fetch(url,{
  headers:{
   Accept:'application/json;version=2.0',
   'Accept-Language':language(config),
   'User-Agent':'TripNexa/1.0',
   'exp-api-key':key
  },
  signal:AbortSignal.timeout(15000)
 });

 if(!response.ok)
  throw new Error(
   `Viator product API returned HTTP ${response.status}`
  );

 const detail=await response.json();

 if(
  detail?.status!=='ACTIVE' ||
  !detail?.productCode ||
  !detail?.productUrl
 )
  return null;

 return {
  ...product,
  ...detail,
  productUrl:detail.productUrl
 };
}

async function fetchProducts(context,config){
 const query=String(context.canonical_place_name||'').trim();

 if(!query)return [];

 const key=[
  clean(query),
  clean(context.city),
  clean(context.country),
  language(config),
  currency(config)
 ].join('|');

 const cached=cache.get(key);

 if(cached&&cached.expires>Date.now())
  return cached.value;

 if(cached)
  cache.delete(key);

 const searchQuery=[
  query,
  context.city
 ].filter(Boolean).join(' ');

 const result=await search(searchQuery,config,25);

 if(!result.configured)
  return [];

 const ranked=result.products
  .filter(product=>
   product &&
   product.productCode &&
   product.productUrl
  )
  .map(product=>({
   ...product,
   _tripnexa_score:scoreProduct(product,context)
  }))
  .filter(product=>product._tripnexa_score>=35)
  .sort((a,b)=>b._tripnexa_score-a._tripnexa_score);

 const ttl=Math.max(
  30,
  Number(config.cache_ttl)||300
 )*1000;

 putCache(key,ranked,ttl);

 return ranked;
}

function priceLabel(product,config){
 const price=
  product?.pricing?.summary?.fromPrice ??
  product?.pricing?.fromPrice ??
  product?.fromPrice ??
  null;

 if(price===null||price===undefined||price==='')
  return null;

 const number=Number(price);

 if(!Number.isFinite(number))
  return null;

 return `${currency(config)} ${number.toFixed(2)}`;
}

function productItem(product,config,validateAffiliateUrl){
 return {
  id:String(product.productCode||''),
  title:product.title||'Viator experience',
  url:validateAffiliateUrl(product.productUrl),
  price_label:priceLabel(product,config),
  currency:currency(config)
 };
}

export default {
 id:'viator',
 name:'Viator',
 description:'Tours, admission & experiences',
 hosts:['viator.com','www.viator.com'],
 root:'viator.com',
 tracking:['pid','mcid','medium'],
 portal:'https://partnerresources.viator.com/travel-content/links/create-links/',
 secret:'VIATOR_API_KEY',

 async searchProducts(context,config){
  return fetchProducts(context,config);
 },

 async resolveProducts(products,context,config,validateAffiliateUrl){
  if(!products?.length)return null;

  const targetWords=words(context.canonical_place_name);
  const seen=new Set();

  const candidates=products
   .filter(product=>{
    const title=clean(product.title);

    if(!title||seen.has(title))
     return false;

    const titleWords=words(product.title);

    let matches=0;

    for(const word of targetWords)
     if(titleWords.has(word))
      matches++;

    const relevant=
     title.includes(clean(context.canonical_place_name)) ||
     !targetWords.size ||
     matches/targetWords.size>=0.4;

    if(!relevant)return false;

    seen.add(title);
    return true;
   })
   .slice(0,5);

  const detailed=(
   await Promise.all(
    candidates.map(async product=>{
     try{
      return await fetchProductDetail(product,config);
     }catch{
      return null;
     }
    })
   )
  ).filter(Boolean);

  const items=detailed.map(product=>
   productItem(
    product,
    config,
    validateAffiliateUrl
   )
  );

  if(!items.length)return null;

  return {
   url:items[0].url,
   confidence:'API',
   mapping_type:'api',
   venue_name:context.canonical_place_name,
   items
  };
 },

 normalizeProductData(product,context,config,validateAffiliateUrl){
  if(!product?.productUrl)return null;

  return {
   url:validateAffiliateUrl(product.productUrl),
   confidence:'API',
   mapping_type:'api',
   product_id:String(product.productCode||''),
   product_title:product.title||context.canonical_place_name,
   price:
    product?.pricing?.summary?.fromPrice ??
    product?.pricing?.fromPrice ??
    product?.fromPrice ??
    null,
   currency:currency(config)
  };
 },

 async testIntegration(config){
  const key=await apiKey();

  if(!key){
   return {
    ok:false,
    api:'Not configured',
    note:'Viator API credential is not configured.'
   };
  }

  try{
   const result=await search(
    'Louvre',
    config,
    1
   );

   return {
    ok:true,
    api:'Connected',
    note:`Live Viator Partner API connection verified${result.products.length?` · ${result.products.length} product returned`:''}.`
   };
  }catch(error){
   return {
    ok:false,
    api:error.message,
    note:'Viator Partner API authentication or connectivity test failed.'
   };
  }
 }
};

