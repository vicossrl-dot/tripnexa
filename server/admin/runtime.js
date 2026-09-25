import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {config} from '../config.js';
import {decryptSecret} from './crypto.js';
import {readSettings} from './settings.js';
import {requestContext,recordEvent} from './telemetry.js';
export const runtimeSettings=()=>requestContext.getStore()?.settings;
export async function credential(name,fallback=''){
 if(!requestContext.getStore()?.settings)return fallback;
 const [rows]=await pool.execute('SELECT encrypted_value FROM managed_secrets WHERE secret_name=?',[name]);
 return rows[0]?decryptSecret(rows[0].encrypted_value,'provider:'+name):fallback;
}
export async function aiConfiguration(){const settings=runtimeSettings()?.settings;return{key:await credential('OPENAI_API_KEY',config.aiKey),model:settings?.text_model||config.aiModel,imageModel:settings?.image_model||config.imageModel,timeout:(settings?.ai_timeout_seconds||120)*1000};}
export async function googleKey(){return credential('GOOGLE_MAPS_API_KEY',config.googleMapsKey);}
export async function consumeQuota(operation,limitKey,amount=1){
 const context=requestContext.getStore(),all=context?.settings;if(!all||!context.userId)return;
 const limit=all.quotas[limitKey];assert(Number.isInteger(limit),500,'Quota policy unavailable.');
 await consumeCounter(context.userId,operation,new Date().toISOString().slice(0,10),limit,amount);
}
export async function consumeCounter(scope,operation,bucket,limit,amount=1){
 await transaction(async db=>{
  await db.execute('INSERT INTO usage_counters(scope,operation,bucket,count)VALUES(?,?,?,0) ON DUPLICATE KEY UPDATE count=count',[scope,operation,bucket]);
  const [[row]]=await db.execute('SELECT count FROM usage_counters WHERE scope=? AND operation=? AND bucket=? FOR UPDATE',[scope,operation,bucket]);assert(Number(row.count)+amount<=limit,429,'This usage limit has been reached. Please try again later.');
  await db.execute('UPDATE usage_counters SET count=count+? WHERE scope=? AND operation=? AND bucket=?',[amount,scope,operation,bucket]);
 });
}
export async function providerQuota(provider,operation){
 const context=requestContext.getStore();if(!context?.settings||!context.userId)return;
 const all=context.settings;assert(provider==='openai'?all.settings.ai_enabled:all.settings.google_enabled,503,'This provider is currently disabled.');
 if(provider==='openai')await consumeQuota('ai_request','ai_requests_day');
 else await consumeQuota(operation==='photo'?'google_photo':'google_search',operation==='photo'?'google_photos_day':'google_searches_day');
 await consumeCounter('GLOBAL',provider,new Date().toISOString().slice(0,16),all.quotas[provider==='openai'?'ai_requests_minute':'google_requests_minute']);
}
const gates=[
 [/^\/auth\/register$/,'registration'],[/^\/ai\/trip-names$/,'ai_trip_names'],[/^\/ai\/planning-suggestions$/,'ai_suggestions'],
 [/^\/trips\/[^/]+\/itinerary\/preview$/,'ai_editing'],[/^\/trips\/[^/]+\/itinerary\/pdf$/,'pdf_export'],
 [/^\/places\/(autocomplete|details|resolve)$/,'google_autocomplete'],[/^\/places\/(photo\/|[^/]+\/photos)/,'google_photos'],
 [/^\/trips\/[^/]+\/meals\/[^/]+\/options$/,'restaurant_suggestions'],[/^\/uploads\/wallet$/,'wallet_uploads'],[/^\/trips\/[^/]+\/share$/,'public_sharing'],
];
export async function runtimePolicy(req,res,next){try{
 if(!req.user&&req.path!=='/api/config'&&req.path!=='/config'&&!['/auth/login','/auth/register'].includes(req.path))return next();
 const all=await readSettings(),context=requestContext.getStore();if(context)context.settings=all;
 if(context){context.credentials={};const [secrets]=await pool.query('SELECT secret_name,encrypted_value FROM managed_secrets');for(const row of secrets){try{context.credentials[row.secret_name]=decryptSecret(row.encrypted_value,'provider:'+row.secret_name);}catch{context.credentials[row.secret_name]='';}}}
 if(req.path.startsWith('/admin'))return next();
 if(all.settings.maintenance_enabled&&req.user?.role!=='ADMIN'&&req.user?.role!=='SUPER_ADMIN'&&!req.path.startsWith('/auth'))return res.status(503).json({error:all.settings.maintenance_message,maintenance:true});
 for(const [pattern,flag]of gates)if(pattern.test(req.path)&&!all.features[flag])assert(false,503,'This feature is currently disabled.');
 if(req.method==='POST'&&/^\/trips\/[^/]+\/itinerary$/.test(req.path)){
  if(!all.features.ai_itinerary)req.body.use_ai=false;
  if(req.body.use_ai!==false)await consumeQuota('ai_itinerary','ai_itinerary_day');
 }
 if(req.method==='GET'&&/^\/trips\/[^/]+\/itinerary\/pdf$/.test(req.path))await consumeQuota('pdf_export','pdf_exports_day');
 if(req.method==='POST'&&/^\/trips\/[^/]+\/meals\/[^/]+\/options$/.test(req.path))await consumeQuota('meal_search','meal_searches_day');
 const path=req.path;res.on('finish',()=>{if(res.statusCode>=400)return;
  if(req.method==='POST'&&path==='/entities/Trip')void recordEvent('trip_created',req.user?.id);
  if(req.method==='POST'&&/^\/trips\/[^/]+\/itinerary$/.test(path))void recordEvent(req.body?.regenerate?'itinerary_regenerated':'itinerary_generated',req.user?.id);
  if(req.method==='GET'&&path.endsWith('/itinerary/pdf'))void recordEvent('pdf_exported',req.user?.id);
  if(req.method==='POST'&&path.endsWith('/share')&&req.body.enabled)void recordEvent('share_enabled',req.user?.id);
  if(req.method==='POST'&&/^\/uploads(?:\/|$)/.test(path))void recordEvent('file_uploaded',req.user?.id);
  if(path.endsWith('/options')&&path.includes('/meals/'))void recordEvent('meal_search',req.user?.id);
 });next();
}catch(error){next(error);}}
