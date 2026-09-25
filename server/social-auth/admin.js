import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {importPKCS8} from 'jose';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {requireSuperAdmin,requireRecentAuth} from '../admin/permissions.js';
import {actionReason,auditRequest} from '../admin/audit.js';
import {encryptSecret} from '../admin/crypto.js';
import {getAppUrls,resolveUrls,normalizeOrigin,urlDetails} from '../app-urls.js';
import {socialConfiguration,publicProvider,providerDefinitions,appleClientSecret} from './providers.js';
export const authenticationAdminRouter=Router();
const sensitive=[requireSuperAdmin,requireRecentAuth];
const validationLimit=rateLimit({windowMs:60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false});
const lock=db=>db.execute("SELECT name FROM admin_locks WHERE name='social_identities' FOR UPDATE");
authenticationAdminRouter.get('/domains',async(_req,res)=>res.json(urlDetails(await getAppUrls())));
function domainInput(body){return {application_url:body.application_url?normalizeOrigin(body.application_url):null,public_site_url:body.public_site_url?normalizeOrigin(body.public_site_url):null};}
authenticationAdminRouter.post('/domains/validate',...sensitive,validationLimit,async(req,res)=>res.json(urlDetails(resolveUrls(domainInput(req.body)))));
authenticationAdminRouter.put('/domains',...sensitive,async(req,res)=>{
 const reason=actionReason(req.body,'SAVE'),values=domainInput(req.body),next=resolveUrls(values);assert(next.application.value&&next.site.value,400,'Both effective URLs must be valid.');assert(next.application.value!==next.site.value||req.body.same_origin_confirmed===true,400,'Confirm that the public website and application intentionally share an origin.');
 await transaction(async db=>{await lock(db);const [[row]]=await db.execute('SELECT * FROM application_urls WHERE id=1 FOR UPDATE');assert((row?.version||0)===req.body.version,409,'Domain configuration changed. Reload before saving.');const previous=resolveUrls(row||{});
  await db.execute('INSERT INTO application_urls(id,public_site_url,application_url,version,updated_by)VALUES(1,?,?,1,?) ON DUPLICATE KEY UPDATE public_site_url=VALUES(public_site_url),application_url=VALUES(application_url),version=version+1,updated_by=VALUES(updated_by)',[values.public_site_url,values.application_url,req.user.id]);
  // Freeze environment-backed provider callbacks before changing the effective origin.
  if(previous.application.value!==next.application.value)for(const provider of ['google','apple']){const p=await socialConfiguration(provider,previous);if(p.source==='env'&&p.settings.client_id)await db.execute('INSERT IGNORE INTO social_providers(provider,config,updated_by)VALUES(?,?,?)',[provider,JSON.stringify(p.settings),req.user.id]);}
  for(const key of ['application','site'])await auditRequest(req,{action:key==='application'?'application_domain_changed':'public_site_domain_changed',reason,targetType:'configuration',targetId:key,metadata:{old_value:previous[key].value||'',new_value:next[key].value,version:(row?.version||0)+1}},db);
 });res.json(urlDetails(await getAppUrls()));
});
authenticationAdminRouter.get('/authentication',async(_req,res)=>res.json({email_password:true,providers:await Promise.all(['google','apple'].map(async id=>publicProvider(await socialConfiguration(id))))}));
authenticationAdminRouter.put('/authentication/:provider',...sensitive,async(req,res)=>{
 const provider=req.params.provider,p=await socialConfiguration(provider),body=req.body,reason=actionReason(body,'SAVE');assert(typeof body.enabled==='boolean',400,'Choose whether the provider is enabled.');
 const settings={enabled:body.enabled,client_id:String(body.client_id||'').trim(),confirmed_callback:body.console_confirmed===true?p.callback:p.settings.confirmed_callback||null};assert(/^[a-zA-Z0-9._:-]{0,255}$/.test(settings.client_id),400,'Invalid client identifier.');
 if(provider==='apple')for(const key of ['team_id','key_id']){settings[key]=String(body[key]||'').trim();assert(!settings[key]||/^[A-Z0-9]{10}$/.test(settings[key]),400,'Apple team and key identifiers must contain ten uppercase letters or digits.');}
 if(settings.client_id!==p.settings.client_id&&!body.console_confirmed)settings.confirmed_callback=null;
 await transaction(async db=>{await lock(db);const [[row]]=await db.execute('SELECT version FROM social_providers WHERE provider=? FOR UPDATE',[provider]);assert((row?.version||0)===body.version,409,'Provider configuration changed. Reload before saving.');await db.execute('INSERT INTO social_providers(provider,config,updated_by)VALUES(?,?,?) ON DUPLICATE KEY UPDATE config=VALUES(config),version=version+1,updated_by=VALUES(updated_by),last_test=NULL,tested_at=NULL',[provider,JSON.stringify(settings),req.user.id]);await auditRequest(req,{action:'social_provider_config_changed',reason,targetType:'provider',targetId:provider,metadata:{provider,version:(row?.version||0)+1}},db);});res.json(publicProvider(await socialConfiguration(provider)));
});
authenticationAdminRouter.post('/authentication/:provider/secret',...sensitive,async(req,res)=>{
 const provider=req.params.provider,definition=Object.hasOwn(providerDefinitions,provider)?providerDefinitions[provider]:null;assert(definition,404,'Provider not found.');const reason=actionReason(req.body,'SAVE'),value=req.body.value;
 assert(typeof value==='string'&&value.length>0&&value.length<=16000,400,'Enter a valid credential.');if(provider==='apple'){try{await importPKCS8(value.replace(/\\n/g,'\n'),'ES256');}catch{assert(false,400,'Enter a valid Apple ES256 PKCS8 private key.');}}else assert(!/[\r\n\x00]/.test(value),400,'Invalid client secret.');
 const encrypted=JSON.stringify(encryptSecret(value,'provider:'+definition.secret));
 await transaction(async db=>{await lock(db);const [[row]]=await db.execute('SELECT version FROM managed_secrets WHERE secret_name=? FOR UPDATE',[definition.secret]);assert((row?.version||0)===req.body.version,409,'Credential changed. Reload before saving.');await db.execute('INSERT INTO managed_secrets(secret_name,provider,encrypted_value,version,updated_by)VALUES(?,?,?,1,?) ON DUPLICATE KEY UPDATE encrypted_value=VALUES(encrypted_value),version=version+1,updated_by=VALUES(updated_by)',[definition.secret,provider,encrypted,req.user.id]);await db.execute('UPDATE social_providers SET last_test=NULL,tested_at=NULL WHERE provider=?',[provider]);await auditRequest(req,{action:'social_provider_secret_changed',reason,targetType:'provider',targetId:provider,metadata:{provider}},db);});res.json(publicProvider(await socialConfiguration(provider)));
});
authenticationAdminRouter.post('/authentication/:provider/test',...sensitive,rateLimit({windowMs:60000,limit:5,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
 const p=await socialConfiguration(req.params.provider);const checks={client_id:!!p.settings.client_id,credential:!!p.secret.value,application_url:!!p.urls.application.value,callback_generated:!!p.callback,configured:p.configured,callback_confirmed:!p.requiresUpdate,https:p.callback?.startsWith('https:')||false,ready:p.ready,discovery:false,real_login_tested:false};
 if(p.provider==='apple')Object.assign(checks,{team_id:!!p.settings.team_id,key_id:!!p.settings.key_id,client_secret_generation:false});
 if(p.configured){try{if(p.provider==='apple'){await appleClientSecret(p.settings,p.secret.value);checks.client_secret_generation=true;}const response=await fetch(p.jwks,{signal:AbortSignal.timeout(8000),redirect:'error'});checks.discovery=response.ok&&Array.isArray((await response.json()).keys);}catch{checks.discovery=false;}}
 await transaction(async db=>{await lock(db);const current=await socialConfiguration(p.provider);assert(current.fingerprint===p.fingerprint,409,'Configuration changed. Test again.');await db.execute('INSERT INTO social_providers(provider,config,last_test,tested_at,updated_by)VALUES(?,?,?,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE last_test=VALUES(last_test),tested_at=VALUES(tested_at)',[p.provider,JSON.stringify(p.settings),JSON.stringify(checks),req.user.id]);await auditRequest(req,{action:'social_provider_configuration_test',targetType:'provider',targetId:p.provider,metadata:{provider:p.provider}},db);});res.json({checks,message:'Configuration checks only. A successful provider login is still required.'});
});
