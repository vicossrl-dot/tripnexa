export default {
 id:'klook',
 name:'Klook',
 description:'Tickets, tours & experiences',
 hosts:['klook.com','www.klook.com','affiliate.klook.com'],
 root:'klook.com',
 tracking:['aid','aff_adid'],
 portal:'https://affiliate.klook.com/',
 secret:null,

 async testIntegration(config,validateAffiliateUrl){
  const aid=String(config.partner_id||'').trim();

  if(!aid){
   return {
    ok:false,
    api:'Not configured',
    note:'Enter your Klook Affiliate ID (AID).'
   };
  }

  if(!/^\d{1,20}$/.test(aid)){
   return {
    ok:false,
    api:'Not configured',
    note:'The Klook Affiliate ID (AID) format is invalid.'
   };
  }

  if(config.search_template)
   validateAffiliateUrl(config.search_template,true);

  return {
   ok:true,
   api:'Link-only',
   note:'Klook affiliate link-only mode is configured. Exact mappings use official Klook affiliate links with AID and aff_adid tracking. Advanced API/data-feed access is optional.'
  };
 }
};
