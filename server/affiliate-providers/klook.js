function ids(config={}){
 const aid=String(config.partner_id||'').trim();
 const affAdId=String(config.aff_adid||'').trim();
 return {aid,affAdId};
}

const validId=value=>/^\d{1,20}$/.test(value);

function buildSearch(context,config,validateAffiliateUrl){
 const {aid,affAdId}=ids(config);

 if(!validId(aid)||!validId(affAdId))return null;

 const query=[
  context.canonical_place_name,
  context.city
 ].filter(Boolean).join(' ').trim();

 if(!query)return null;

 const destination=
  'https://www.klook.com/en-US/search/result/?query='+
  encodeURIComponent(query)+
  '&search_scope=main_search';

 const url=new URL('https://affiliate.klook.com/redirect');
 url.searchParams.set('aid',aid);
 url.searchParams.set('aff_adid',affAdId);
 url.searchParams.set('k_site',destination);

 return validateAffiliateUrl(url.toString());
}

export default {
 id:'klook',
 name:'Klook',
 description:'Tickets, tours & experiences',
 hosts:['klook.com','www.klook.com','affiliate.klook.com'],
 root:'klook.com',
 tracking:['aid','aff_adid'],
 portal:'https://affiliate.klook.com/',
 secret:null,

 buildAffiliateSearchLink:buildSearch,

 async testIntegration(config,validateAffiliateUrl){
  const {aid,affAdId}=ids(config);

  if(!validId(aid)){
   return {
    ok:false,
    api:'Not configured',
    note:'Enter a valid Klook Affiliate ID (AID).'
   };
  }

  if(!validId(affAdId)){
   return {
    ok:false,
    api:'Not configured',
    note:'Enter a valid Klook Affiliate Ad ID (aff_adid).'
   };
  }

  const sample=buildSearch(
   {canonical_place_name:'Sainte-Chapelle',city:'Paris'},
   config,
   validateAffiliateUrl
  );

  return {
   ok:!!sample,
   api:'Link-only',
   note:'Klook affiliate search links are configured. TripNexa automatically builds a Klook search from the attraction name and city. Advanced API/data-feed access is optional.'
  };
 }
};
