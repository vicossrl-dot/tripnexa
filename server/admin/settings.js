import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {config} from '../config.js';
import {auditRequest,actionReason} from './audit.js';
import {requireSuperAdmin,requireRecentAuth} from './permissions.js';
const text=(value,max=200,extra={})=>({type:'string',default:value,max,...extra});
const number=(value,min,max)=>({type:'number',default:value,min,max});
const boolean=value=>({type:'boolean',default:value});
const choice=(value,options)=>({type:'string',default:value,options});
export const definitions={
 settings:{
  affiliate_public_enabled:boolean(true),affiliate_disclosure_text:text('Some links are affiliate links. TripSync may earn a commission if you book, at no extra cost to you.',500,{public:true}),affiliate_disclosure_url:text('',500,{url:true,public:true}),
  google_routes_enabled:boolean(process.env.GOOGLE_ROUTES_ENABLED==='true'),
  app_name:text('TripSync',60,{public:true}),support_email:text('',254,{public:true,email:true}),default_currency:choice('EUR',['EUR','USD','GBP','RON','MDL','JPY','CHF','CAD','AUD']),default_language:choice('en',['en','ro']),
  homepage_headline:text('Where to next?',120,{public:true}),homepage_subtitle:text('Plan your journey with ease, all your travel data organized in one place.',400,{public:true}),footer_text:text('',200,{public:true}),terms_url:text('',500,{url:true,public:true}),privacy_url:text('',500,{url:true,public:true}),help_url:text('',500,{url:true,public:true}),
  meta_title:text('TripSync',80,{public:true}),meta_description:text('Plan your trips, itinerary and travel documents in one place.',250,{public:true}),share_title:text('TripSync itinerary',100,{public:true}),landing_indexable:boolean(false),shared_indexable:boolean(false),
  maintenance_enabled:boolean(false),maintenance_message:text('TripSync is being updated. Please try again shortly.',300,{public:true}),maintenance_end:text('',40),
  default_day_start:text('09:30',5,{time:true}),default_day_end:text('18:30',5,{time:true}),default_meal_minutes:number(60,0,180),default_walk_day_minutes:number(120,0,480),default_walk_segment_minutes:number(30,0,180),default_pace:choice('balanced',['relaxed','balanced','packed']),
  text_model:text('',100,{model:true}),image_model:text('',100,{model:true}),ai_enabled:boolean(true),ai_timeout_seconds:number(120,10,180),google_enabled:boolean(true),google_timezone_enabled:boolean(true),restaurant_radius_m:number(1500,200,3000),restaurant_results:number(5,1,5),restaurant_cache_minutes:number(10,1,15),
  smtp_host:text('',253,{hostname:true}),smtp_port:choice('587',['25','465','587','2525']),smtp_secure:boolean(false),smtp_from_email:text('',254,{email:true}),smtp_from_name:text('TripSync',60),
  log_retention_days:choice('30',['7','14','30','90']),session_days:number(7,1,14),max_sessions_per_user:number(10,1,25),login_attempt_limit:number(30,5,30),
  referral_allowed_hosts:{type:'array',default:[],max:50},backup_strategy:text('Not configured',500),backup_retention_days:number(30,1,365),backup_interval_hours:number(24,1,168),
  ai_daily_warning_requests:number(1000,1,100000),ai_cost_warning:number(50,0,100000),google_daily_warning_requests:number(5000,1,1000000),auto_disable_expensive:boolean(false),
 },
 branding:{app_name:text('TripSync',60,{public:true}),accent:text('#ffc4ad',7,{color:true,public:true}),logo:text('',200,{asset:true,public:true}),dark_logo:text('',200,{asset:true,public:true}),light_logo:text('',200,{asset:true,public:true}),favicon:text('',200,{asset:true,public:true}),email_logo:text('',200,{asset:true}),pdf_logo:text('',200,{asset:true}),social_image:text('',200,{asset:true,public:true}),pdf_header:text('Your travel itinerary',120),pdf_footer:text('TripSync · Travel itinerary',150)},
 features:Object.fromEntries(['ai_suggestions','ai_trip_names','ai_itinerary','ai_editing','google_autocomplete','google_photos','restaurant_suggestions','pdf_export','public_sharing','wallet_uploads','registration','referral_links'].map(key=>[key,boolean(true)])),
 quotas:{trips_per_user:number(500,1,10000),uploads_per_trip:number(500,1,2000),max_upload_mb:number(10,1,10),storage_mb_per_user:number(2048,10,1048576),ai_requests_day:number(200,0,10000),ai_itinerary_day:number(50,0,1000),google_searches_day:number(1000,0,100000),google_photos_day:number(1000,0,100000),meal_searches_day:number(100,0,10000),pdf_exports_day:number(100,0,10000),concurrent_pdfs:number(2,1,2),ai_requests_minute:number(100,1,1000),google_requests_minute:number(500,1,10000)},
};
const tableFor=section=>section==='features'?'feature_flags':section==='quotas'?'usage_quotas':'app_settings';
const dbKey=(section,key)=>section==='branding'?'branding.'+key:key;
export const parseJson=value=>typeof value==='string'?JSON.parse(value):value;
export function validateSetting(section,key,value){
 const def=definitions[section]?.[key];assert(def,400,'Unknown setting.');
 if(def.type==='number')assert(typeof value==='number'&&Number.isInteger(value)&&value>=def.min&&value<=def.max,400,`Choose a value from ${def.min} to ${def.max}.`);
 else if(def.type==='boolean')assert(typeof value==='boolean',400,'Choose enabled or disabled.');
 else if(def.type==='array')assert(Array.isArray(value)&&value.length<=def.max&&value.every(host=>typeof host==='string'&&/^(?!-)[a-z0-9.-]+\.[a-z]{2,}$/.test(host)),400,'Use a list of hostnames without URLs or credentials.');
 else{assert(typeof value==='string'&&value.length<=(def.max||300)&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value),400,'Invalid setting text.');if(def.options)assert(def.options.includes(value),400,'Choose an allowed value.');
  if(value&&def.email)assert(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value),400,'Enter a valid email address.');
  if(value&&def.url){let url;try{url=new URL(value);}catch{}assert(url?.protocol==='https:'&&!url.username&&!url.password,400,'Use an HTTPS URL without credentials.');}
  if(value&&def.hostname)assert(/^[a-zA-Z0-9.-]+$/.test(value)&&!value.includes('..'),400,'Enter a hostname without protocol or path.');
  if(value&&def.model)assert(/^[a-zA-Z0-9_.:-]+$/.test(value),400,'Invalid model identifier.');
  if(def.color)assert(/^#[a-fA-F0-9]{6}$/.test(value),400,'Use a six-digit hexadecimal color.');
  if(value&&def.asset)assert(/^\/brand-assets\/[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(value),400,'Choose a safely uploaded branding image.');
  if(def.time)assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(value),400,'Choose a valid time.');
 }
 return value;
}
export async function readSettings(){
 const result=Object.fromEntries(Object.entries(definitions).map(([section,defs])=>[section,Object.fromEntries(Object.entries(defs).map(([key,def])=>[key,def.default]))]));
 const versions={};
 for(const table of ['app_settings','feature_flags','usage_quotas']){
  const [rows]=await pool.query(`SELECT setting_key,CAST(value AS CHAR) AS value,version,updated_by,updated_at FROM ${table}`);
  for(const row of rows){const section=table==='feature_flags'?'features':table==='usage_quotas'?'quotas':row.setting_key.startsWith('branding.')?'branding':'settings',key=row.setting_key.replace(/^branding\./,'');if(definitions[section][key]){result[section][key]=validateSetting(section,key,parseJson(row.value));versions[section+'.'+key]={version:row.version,updated_at:row.updated_at,updated_by:row.updated_by};}}
 }
 return{...result,versions};
}
export function publicSettings(all){
 return {app:{...Object.fromEntries(Object.entries(definitions.settings).filter(([,def])=>def.public).map(([key])=>[key,all.settings[key]])),default_currency:all.settings.default_currency,default_language:all.settings.default_language,default_day_start:all.settings.default_day_start,default_day_end:all.settings.default_day_end,default_meal_minutes:all.settings.default_meal_minutes,default_walk_day_minutes:all.settings.default_walk_day_minutes,default_walk_segment_minutes:all.settings.default_walk_segment_minutes,default_pace:all.settings.default_pace},branding:Object.fromEntries(Object.entries(definitions.branding).filter(([,def])=>def.public).map(([key])=>[key,all.branding[key]])),features:all.features,maintenance:{enabled:all.settings.maintenance_enabled,message:all.settings.maintenance_message}};
}
export async function saveSetting(req,section,key,value,expectedVersion){
 validateSetting(section,key,value);const reason=actionReason(req.body,'SAVE'),table=tableFor(section),column=dbKey(section,key);
 await transaction(async db=>{
  await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");
  const [rows]=await db.execute(`SELECT CAST(value AS CHAR) AS value,version FROM ${table} WHERE setting_key=? FOR UPDATE`,[column]);const current=rows[0];assert(Number(expectedVersion)===(current?.version||0),409,'Setting changed. Reload before saving.');
  const version=(current?.version||0)+1,old=current?parseJson(current.value):definitions[section][key].default;
  await db.execute(`INSERT INTO ${table}(setting_key,value,version,updated_by)VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value),version=VALUES(version),updated_by=VALUES(updated_by)`,[column,JSON.stringify(value),version,req.user.id]);
  await db.execute('INSERT INTO settings_history(id,section,setting_key,old_value,new_value,version,updated_by)VALUES(?,?,?,?,?,?,?)',[randomUUID(),section,key,JSON.stringify(old),JSON.stringify(value),version,req.user.id]);
  await auditRequest(req,{action:'settings.change',targetType:section,reason,metadata:{setting:key,version}},db);
 });
}
export const settingsRouter=Router();
for(const section of Object.keys(definitions)){
 const route=section==='quotas'?'/quotas':'/'+section;
 settingsRouter.get(route,async(req,res)=>{const all=await readSettings();res.json({items:Object.entries(definitions[section]).map(([key,def])=>({key,...def,value:all[section][key],...(all.versions[section+'.'+key]||{version:0})})),section,environmentFallback:section==='settings'?{text_model:config.aiModel,image_model:config.imageModel}:undefined});});
 settingsRouter.post(route+'/:key',requireSuperAdmin,requireRecentAuth,async(req,res)=>{await saveSetting(req,section,req.params.key,req.body.value,req.body.version);res.json({ok:true});});
}
settingsRouter.get('/settings/history',requireSuperAdmin,async(req,res)=>{const [items]=await pool.query('SELECT id,section,setting_key,old_value,new_value,version,updated_by,created_at FROM settings_history ORDER BY created_at DESC LIMIT 200');res.json({items});});
settingsRouter.post('/settings/history/:id/rollback',requireSuperAdmin,requireRecentAuth,async(req,res)=>{const [rows]=await pool.execute('SELECT section,setting_key,CAST(old_value AS CHAR) AS old_value FROM settings_history WHERE id=?',[req.params.id]);assert(rows[0],404,'Version not found.');await saveSetting(req,rows[0].section,rows[0].setting_key,parseJson(rows[0].old_value),req.body.version);res.json({ok:true});});
