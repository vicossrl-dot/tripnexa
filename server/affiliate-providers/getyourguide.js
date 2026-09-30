export default {
 id:'getyourguide',
 name:'GetYourGuide',
 description:'Tickets, tours & experiences',
 hosts:['getyourguide.com','www.getyourguide.com'],
 root:'getyourguide.com',
 tracking:['partner_id'],
 portal:'https://partner.getyourguide.com/',
 secret:'GETYOURGUIDE_API_KEY',

 buildAffiliateSearchLink(context,config,validateAffiliateUrl){
  const partnerId=String(config.partner_id||'').trim();

  if(!partnerId)return null;

  if(!/^[A-Za-z0-9_-]{3,64}$/.test(partnerId))
   throw new Error('Invalid GetYourGuide partner ID.');

  const query=[
   context.canonical_place_name,
   context.city
  ].filter(Boolean).join(' ').trim();

  if(!query)return null;

  const url=new URL('https://www.getyourguide.com/s/');
  url.searchParams.set('q',query);
  url.searchParams.set('partner_id',partnerId);
  url.searchParams.set('utm_medium','online_publisher');

  return validateAffiliateUrl(url.toString());
 },

 async testIntegration(config,validateAffiliateUrl){
  const partnerId=String(config.partner_id||'').trim();

  if(!partnerId){
   return {
    ok:false,
    api:'Not configured',
    note:'Enter your GetYourGuide Partner ID.'
   };
  }

  if(!/^[A-Za-z0-9_-]{3,64}$/.test(partnerId)){
   return {
    ok:false,
    api:'Not configured',
    note:'The GetYourGuide Partner ID format is invalid.'
   };
  }

  const url=new URL('https://www.getyourguide.com/s/');
  url.searchParams.set('q','Sainte-Chapelle Paris');
  url.searchParams.set('partner_id',partnerId);
  url.searchParams.set('utm_medium','online_publisher');

  validateAffiliateUrl(url.toString());

  return {
   ok:true,
   api:'Link-only',
   note:'GetYourGuide affiliate search links are configured. Public Partner API access is not required for this mode.'
  };
 }
};
