import {Router} from 'express';
import nodemailer from 'nodemailer';
import {pool,transaction} from '../db.js';
import {config} from '../config.js';
import {assert} from '../errors.js';
import {encryptSecret,masterKeyConfigured} from './crypto.js';
import {auditRequest,actionReason} from './audit.js';
import {requireSuperAdmin,requireRecentAuth} from './permissions.js';
import {runtimeSettings,credential} from './runtime.js';
import {rateLimit} from 'express-rate-limit';
import {sendMail} from '../mail.js';
const secrets={OPENAI_API_KEY:'openai',GOOGLE_MAPS_API_KEY:'google',SMTP_PASSWORD:'smtp',SMTP_USER:'smtp',GETYOURGUIDE_API_KEY:'getyourguide',VIATOR_API_KEY:'viator',TIQETS_API_TOKEN:'tiqets'};
export async function smtpConfiguration(overrides={}){
 const settings=runtimeSettings()?.settings||{},host=settings.smtp_host||process.env.SMTP_HOST||'';
 return{host,port:Number(settings.smtp_host?settings.smtp_port:process.env.SMTP_PORT||587),secure:settings.smtp_host?settings.smtp_secure:process.env.SMTP_SECURE==='true',
  user:overrides.SMTP_USER??await credential('SMTP_USER',process.env.SMTP_USER||''),password:overrides.SMTP_PASSWORD??await credential('SMTP_PASSWORD',process.env.SMTP_PASSWORD||''),
  from:settings.smtp_from_email?{name:settings.smtp_from_name,address:settings.smtp_from_email}:process.env.SMTP_FROM||'TripSync <noreply@localhost>'};
}
export function smtpTransport(settings){return nodemailer.createTransport({host:settings.host,port:settings.port,secure:settings.secure,requireTLS:config.production&&!settings.secure,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,...(settings.user?{auth:{user:settings.user,pass:settings.password}}:{})});}
export async function checkProvider(provider,overrides={}){
 try{
  if(provider==='openai'){
   const key=overrides.OPENAI_API_KEY??config.aiKey;assert(key,400,'OpenAI is not configured.');const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(10000)});return{ok:response.ok,status:response.status,note:'Credential/model-list access checked; generation was not requested.'};
  }
  if(provider==='google'){
   const key=overrides.GOOGLE_MAPS_API_KEY??config.googleMapsKey;assert(key,400,'Google is not configured.');
   const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id'},body:JSON.stringify({textQuery:'Eiffel Tower Paris',pageSize:1}),signal:AbortSignal.timeout(10000)});return{ok:response.ok,status:response.status,note:'One neutral Places search was requested. Normal provider charges may apply.'};
  }
  if(provider==='smtp'){const settings=await smtpConfiguration(overrides);assert(settings.host,400,'SMTP is not configured.');await smtpTransport(settings).verify();return{ok:true,note:'SMTP connection verified. No message was sent.'};}
  assert(false,400,'Unsupported provider check.');
 }catch(error){return{ok:false,status:error.status||null,note:'The provider check failed. Check connectivity, permissions and configuration.'};}
}
export const providersRouter=Router();
const limit=rateLimit({windowMs:15*60000,limit:10,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false});
providersRouter.get('/secrets',requireSuperAdmin,async(req,res)=>{
 const [rows]=await pool.query('SELECT secret_name,provider,version,updated_at FROM managed_secrets');
 res.json({editingEnabled:masterKeyConfigured(),items:Object.entries(secrets).map(([name,provider])=>{const override=rows.find(row=>row.secret_name===name);return{name,provider,testSupported:['openai','google','smtp'].includes(provider),configured:!!override||!!process.env[name],source:override?'encrypted override':process.env[name]?'environment':'missing',version:override?.version||0,updated_at:override?.updated_at||null};})});
});
providersRouter.post('/secrets/:name',requireSuperAdmin,requireRecentAuth,limit,async(req,res)=>{
 const name=req.params.name;assert(Object.hasOwn(secrets,name),400,'Unknown managed secret.');assert(masterKeyConfigured(),503,'Server master key is not configured.');const reason=actionReason(req.body,'REPLACE');
 assert(typeof req.body.value==='string'&&req.body.value.length>=3&&req.body.value.length<=4096&&!/[\r\n\0]/.test(req.body.value),400,'Enter a valid credential.');
 let check=null;if(req.body.test!==false){check=await checkProvider(secrets[name],{[name]:req.body.value});assert(check.ok,400,'Credential check failed; the existing configuration is unchanged.');}
 await transaction(async db=>{
  await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");const [rows]=await db.execute('SELECT version FROM managed_secrets WHERE secret_name=? FOR UPDATE',[name]);const version=(rows[0]?.version||0)+1;assert(Number(req.body.version)===(rows[0]?.version||0),409,'Credential version changed. Reload before replacing.');
  await db.execute('INSERT INTO managed_secrets(secret_name,provider,encrypted_value,version,updated_by)VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE encrypted_value=VALUES(encrypted_value),version=VALUES(version),updated_by=VALUES(updated_by)',[name,secrets[name],JSON.stringify(encryptSecret(req.body.value,'provider:'+name)),version,req.user.id]);
  await auditRequest(req,{action:'secret.replace',targetType:'provider',reason,metadata:{provider:secrets[name],changed:true,version}},db);
 });res.json({ok:true,tested:!!check});
});
providersRouter.post('/secrets/:name/remove',requireSuperAdmin,requireRecentAuth,async(req,res)=>{
 assert(Object.hasOwn(secrets,req.params.name),400,'Unknown managed secret.');const reason=actionReason(req.body,'REMOVE');await transaction(async db=>{const [result]=await db.execute('DELETE FROM managed_secrets WHERE secret_name=? AND version=?',[req.params.name,Number(req.body.version)]);assert(result.affectedRows===1,409,'Credential version changed. Reload before removing.');await auditRequest(req,{action:'secret.remove_override',targetType:'provider',reason,metadata:{provider:secrets[req.params.name],changed:true}},db);});res.json({ok:true});
});
providersRouter.post('/providers/:provider/check',requireSuperAdmin,requireRecentAuth,limit,async(req,res)=>{
 assert(['openai','google','smtp'].includes(req.params.provider),400,'Unsupported provider.');const reason=actionReason(req.body,'TEST'),result=await checkProvider(req.params.provider);await auditRequest(req,{action:'provider.check',targetType:'provider',result:result.ok?'success':'failure',reason,metadata:{provider:req.params.provider}});res.json(result);
});
providersRouter.get('/email/status',async(req,res)=>{const settings=await smtpConfiguration();const [events]=await pool.query('SELECT id,template,status,error_code,created_at FROM email_events ORDER BY created_at DESC LIMIT 100');res.json({configured:!!settings.host,mode:settings.host?'smtp':config.production?'unconfigured':'development outbox',events});});
providersRouter.post('/email/test',requireSuperAdmin,requireRecentAuth,limit,async(req,res)=>{
 const reason=actionReason(req.body,'SEND');assert(req.user.email_verified,403,'Verify your email first.');const settings=await smtpConfiguration();assert(settings.host,409,'Configure SMTP before sending a test.');
 await sendMail(req.user.email,'TripSync administration test','This is a test requested by the verified account owner.','admin_test',req.user.id);await auditRequest(req,{action:'email.test',targetType:'user',targetId:req.user.id,reason});res.json({ok:true,sentTo:'Your verified account email'});
});
