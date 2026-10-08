export const DEFAULT_BRANDING = Object.freeze({appName:'TripNexa',logo:''});

export function normalizePublicSettings(payload){
 const branding=payload?.branding||{},app=payload?.app||{};
 return {
  branding:{
   appName:typeof branding.app_name==='string'&&branding.app_name.trim()?branding.app_name.trim():DEFAULT_BRANDING.appName,
   logo:typeof branding.logo==='string'?branding.logo.trim():DEFAULT_BRANDING.logo,
  },
  affiliateDisclosure:{
   text:typeof app.affiliate_disclosure_text==='string'?app.affiliate_disclosure_text:'',
   url:typeof app.affiliate_disclosure_url==='string'?app.affiliate_disclosure_url:'',
  },
 };
}

export function resolveBrandMark(branding,imageFailed=false){
 const appName=branding?.appName||DEFAULT_BRANDING.appName;
 if(branding?.logo&&!imageFailed)return {type:'image',src:branding.logo,alt:appName};
 return {type:'fallback',appName,wordmark:appName.endsWith('.')?appName:`${appName}.`};
}