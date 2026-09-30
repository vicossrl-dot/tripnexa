import {credential} from '../admin/runtime.js';

const API='https://api.tiqets.com/v2/products';
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

const slug=value=>
 String(value||'')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu,'')
  .toLowerCase()
  .replace(/['’]/g,'')
  .replace(/[^a-z0-9]+/g,'-')
  .replace(/^-+|-+$/g,'');

function scoreProduct(product,context){
 const target=clean(context.canonical_place_name);
 const title=clean(product.title);
 const venue=clean(product.venue?.name);
 const targetCity=clean(context.city);
 const targetCountry=clean(context.country);
 const city=clean(product.city_name);
 const country=clean(product.country_name);

 let score=0;

 if(title===target||venue===target)score+=140;
 else{
  if(target&&(title.includes(target)||venue.includes(target)))score+=90;

  const wanted=words(target);
  const found=words(`${title} ${venue}`);

  if(wanted.size){
   let matches=0;
   for(const word of wanted)if(found.has(word))matches++;
   score+=Math.round((matches/wanted.size)*60);
  }
 }

 if(targetCity&&city===targetCity)score+=35;
 else if(targetCity&&city&&city!==targetCity)score-=10;

 if(targetCountry&&country===targetCountry)score+=15;

 if(product.sale_status==='available')score+=10;
 if(product.product_url)score+=5;

 return score;
}

function putCache(key,value,ttl){
 cache.set(key,{expires:Date.now()+ttl,value});

 while(cache.size>500){
  const first=cache.keys().next().value;
  cache.delete(first);
 }
}

async function token(){
 return credential(
  'TIQETS_API_TOKEN',
  process.env.TIQETS_API_TOKEN||''
 );
}

async function fetchProducts(context,config){
 const query=String(context.canonical_place_name||'').trim();
 if(!query)return [];

 const key=[
  clean(query),
  clean(context.city),
  clean(context.country)
 ].join('|');

 const cached=cache.get(key);

 if(cached&&cached.expires>Date.now())
  return cached.value;

 if(cached)cache.delete(key);

 const apiToken=await token();
 if(!apiToken)return [];

 const url=new URL(API);
 url.searchParams.set('query',query);
 url.searchParams.set('page_size','25');

 const response=await fetch(url,{
  headers:{
   Accept:'application/json',
   'User-Agent':'TripNexa/1.0',
   Authorization:`Token ${apiToken}`
  },
  signal:AbortSignal.timeout(12000)
 });

 if(!response.ok)
  throw new Error(`Tiqets API returned HTTP ${response.status}`);

 const data=await response.json();

 const products=Array.isArray(data.products)
  ? data.products
  : [];

 const ranked=products
  .filter(product=>
   product &&
   product.product_url &&
   product.sale_status!=='unavailable'
  )
  .map(product=>({
   ...product,
   _tripnexa_score:scoreProduct(product,context)
  }))
  .filter(product=>product._tripnexa_score>=45)
  .sort((a,b)=>b._tripnexa_score-a._tripnexa_score);

 const ttl=Math.max(
  30,
  Number(config.cache_ttl)||300
 )*1000;

 putCache(key,ranked,ttl);

 return ranked;
}

function venueUrl(product,validateAffiliateUrl){
 const venue=product?.venue;

 if(!venue?.id||!venue?.name||!product?.product_url)
  return null;

 let source;
 try{
  source=new URL(product.product_url);
 }catch{
  return null;
 }

 const partner=source.searchParams.get('partner');
 if(!partner)return null;

 const value=new URL(
  `https://www.tiqets.com/en/${slug(venue.name)}-tickets-l${encodeURIComponent(String(venue.id))}/`
 );

 for(const [key,val] of source.searchParams){
  value.searchParams.set(key,val);
 }

 return validateAffiliateUrl(value.toString());
}

function productItem(product,validateAffiliateUrl){
 return {
  id:String(product.id||''),
  title:product.title||'Ticket option',
  url:validateAffiliateUrl(product.product_url),
  price_label:product.display_price||null,
  currency:product.currency||null,
  venue_id:String(product.venue?.id||''),
  venue_name:product.venue?.name||null
 };
}

export default {
 id:'tiqets',
 name:'Tiqets',
 description:'Attraction & museum tickets',
 hosts:['tiqets.com','www.tiqets.com'],
 root:'tiqets.com',
 tracking:[],
 portal:'https://www.tiqets.com/en/partner-program/',
 secret:'TIQETS_API_TOKEN',

 async searchProducts(context,config){
  return fetchProducts(context,config);
 },

 resolveProducts(products,context,config,validateAffiliateUrl){
  if(!products?.length)return null;

  const target=clean(context.canonical_place_name);

  const primary=
   products.find(product=>{
    const venue=clean(product.venue?.name);
    return venue&&(
     venue===target ||
     venue.includes(target) ||
     target.includes(venue)
    );
   }) ||
   products[0];

  const venueId=String(primary?.venue?.id||'');

  if(!venueId){
   const item=productItem(primary,validateAffiliateUrl);

   return {
    url:item.url,
    confidence:'API',
    mapping_type:'api',
    items:[item]
   };
  }

  const seen=new Set();

  const targetWords=words(context.canonical_place_name);

  const sameVenue=products
   .filter(product=>
    String(product.venue?.id||'')===venueId &&
    product.product_url
   )
   .filter(product=>{
    const title=clean(product.title);
    const titleWords=words(product.title);

    let matches=0;
    for(const word of targetWords)
     if(titleWords.has(word))matches++;

    const relevant=
     title.includes(target) ||
     (targetWords.size>0 && matches/targetWords.size>=0.5);

    if(!relevant)return false;

    const key=title;
    if(!key||seen.has(key))return false;
    seen.add(key);
    return true;
   })
   .slice(0,5)
   .map(product=>productItem(product,validateAffiliateUrl));

  if(!sameVenue.length)return null;

  return {
   url:sameVenue[0].url,
   confidence:'API',
   mapping_type:'api',
   venue_id:venueId,
   venue_name:primary.venue?.name||context.canonical_place_name,
   items:sameVenue,
   all_url:venueUrl(primary,validateAffiliateUrl)
  };
 },

 normalizeProductData(product,context,config,validateAffiliateUrl){
  if(!product?.product_url)return null;

  return {
   url:validateAffiliateUrl(product.product_url),
   confidence:'API',
   mapping_type:'api',
   product_id:String(product.id||''),
   product_title:product.title||context.canonical_place_name,
   price:product.display_price??product.price??null,
   currency:product.currency||config.currency||'EUR'
  };
 },

 async testIntegration(){
  const apiToken=await token();

  if(!apiToken){
   return {
    ok:false,
    api:'Not configured',
    note:'Tiqets API credential is not configured.'
   };
  }

  const url=new URL(API);
  url.searchParams.set('page_size','1');

  const response=await fetch(url,{
   headers:{
    Accept:'application/json',
    'User-Agent':'TripNexa/1.0',
    Authorization:`Token ${apiToken}`
   },
   signal:AbortSignal.timeout(12000)
  });

  if(!response.ok){
   return {
    ok:false,
    api:`HTTP ${response.status}`,
    note:'Tiqets API authentication or connectivity test failed.'
   };
  }

  const data=await response.json();

  return {
   ok:data.success!==false,
   api:'Connected',
   note:'Live Tiqets Content API connection verified.'
  };
 }
};

