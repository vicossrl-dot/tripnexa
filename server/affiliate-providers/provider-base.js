import {assert} from '../errors.js';
const fields=new Set(['query','name','city','country','language','currency']);
export function validateUrl(raw,hosts,{template=false,tracking=[],depth=0}={}){
 assert(depth<4,400,'Too many nested provider redirects.');
 assert(typeof raw==='string'&&raw.length>0&&raw.length<=3000&&!/[\s\\\x00-\x1f]/.test(raw),400,'Enter an approved HTTPS partner link.');
 const tokens=[...raw.matchAll(/\{([^}]+)\}/g)].map(m=>m[1]);
 assert(template?tokens.every(key=>fields.has(key)):tokens.length===0,400,'Unsupported link template field.');
 const sample=raw.replace(/\{[^}]+\}/g,'sample');let url;try{url=new URL(sample);}catch{assert(false,400,'Invalid partner link.');}
 assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&hosts.includes(url.hostname)&&!/[{}]/.test(sample),400,'Use an approved official provider host over HTTPS.');
 assert(!/[{}]/.test(raw.slice(0,raw.indexOf('/',8)<0?raw.length:raw.indexOf('/',8))),400,'The provider host cannot be a template.');
 for(const key of tracking)assert(url.searchParams.get(key)&&!new RegExp('(?:[?&])'+key+'=[^&]*[{}]','i').test(raw),400,'Preserve the tracking parameters from the official partner link.');
 if(tokens.length)assert(![...url.searchParams.keys()].some(k=>/^(?:sig|signature|hmac|token)$/i.test(k)),400,'Signed and opaque links must be saved as exact mappings without template fields.');
 for(const [key,value] of url.searchParams){
  assert(!/(?:api.?key|access.?token|secret|password|authorization)/i.test(key),400,'API credentials must never be placed in affiliate links.');
  if(/^(?:url|redirect|redirect_url|redirect_uri|destination|target|next|return_url)$/i.test(key)||/^https?:|^\/\//i.test(value)){
   let target;try{target=new URL(value);}catch{assert(false,400,'Nested redirects are not supported.');}
   assert(target.protocol==='https:'&&hosts.includes(target.hostname)&&!target.username&&!target.password&&!target.port,400,'The redirect destination must be an approved provider host.');
   validateUrl(value,hosts,{depth:depth+1});
  }
 }
 return raw; // Keep opaque/signed URLs byte-for-byte; never serialize URLSearchParams.
}
export function createProvider(definition,config={}){
 const hosts=config.allowed_hosts||definition.hosts;
 const validateAffiliateUrl=(url,template=false)=>validateUrl(url,hosts,{template,tracking:definition.tracking});
 return {
  ...definition,config,isEnabled:()=>!!config.enabled,
  validateAffiliateUrl,
  getStatus:count=>!config.enabled?'DISABLED':config.search_template||count?'AFFILIATE READY':'NOT CONFIGURED',
  buildAffiliateSearchLink(context){
   if(!config.search_template||config.fallback==='none')return null;
   assert(config.search_template.includes('{query}'),400,'Search links must include the complete place query.');
   validateAffiliateUrl(config.search_template,true);
   const values={...context,name:context.canonical_place_name,query:[context.canonical_place_name,context.city,context.country].filter(Boolean).join(' '),language:context.trip_language||config.language,currency:context.trip_currency||config.currency};
   if(!context.city&&!context.country)return null;
   const url=config.search_template.replace(/\{([^}]+)\}/g,(_,key)=>encodeURIComponent(values[key]||''));
   return validateAffiliateUrl(url);
  },
  async searchProducts(){return [];},
  normalizeProductData(){return null;},
  async resolvePlace(context,mappings=[]){
   const exact=mappings.find(m=>m.enabled&&m.google_place_id===context.google_place_id&&m.affiliate_url);
   if(exact)return {url:validateAffiliateUrl(exact.affiliate_url),confidence:'EXACT',mapping_type:'exact'};
   const url=this.buildAffiliateSearchLink(context);
   return url?{url,confidence:'SEARCH_FALLBACK',mapping_type:'search fallback'}:null;
  },
  async testIntegration(){
   if(config.search_template)validateAffiliateUrl(config.search_template,true);
   return {ok:!!config.search_template,note:'Local URL validation only. Verify relevance and tracking in the partner portal. API access is not configured.',api:'Not configured'};
  },
 };
}
