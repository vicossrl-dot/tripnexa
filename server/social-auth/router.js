import {Router} from 'express';
import {rateLimit} from 'express-rate-limit';
import {randomBytes,createHash} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {config} from '../config.js';
import {assert} from '../errors.js';
import {digest,secretToken,verifyPassword,hashPassword} from '../security.js';
import {requireUser,startSession} from '../auth.js';
import {auditRequest} from '../admin/audit.js';
import {readSettings} from '../admin/settings.js';
import {getAppUrls,buildApplicationUrl,safePath} from '../app-urls.js';
import {socialConfiguration,exchangeIdentity} from './providers.js';
import {resolveAccount,attachIdentity,hasPassword} from './accounts.js';

export const socialRouter=Router();
const limit=()=>rateLimit({windowMs:15*60000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Too many sign-in attempts. Please try again later.'}});
const cookieValue=(req,name)=>{const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:'';};
const bindingName=provider=>'tripsync_oauth_'+provider;
const bindingOptions=provider=>({httpOnly:true,secure:provider==='apple'||config.production,sameSite:provider==='apple'?'none':'lax',path:'/',maxAge:10*60000});
const linkOptions=()=>({httpOnly:true,secure:config.production,sameSite:'lax',path:'/',maxAge:10*60000});
const recent=req=>req.session&&Date.now()-Date.parse(String(req.session.authenticated_at).replace(' ','T')+'Z')<10*60000;
const lock=db=>db.execute("SELECT name FROM admin_locks WHERE name='social_identities' FOR UPDATE");
async function confirm(req){assert(req.user,401,'Please sign in.');assert(recent(req)||await verifyPassword(req.body.password,req.user.password_hash),403,'Sign in again or confirm your current password.');}

socialRouter.get('/auth/providers',async(_req,res)=>{const urls=await getAppUrls();const providers=await Promise.all(['google','apple'].map(p=>socialConfiguration(p,urls)));res.json({password:true,google:providers.some(p=>p.provider==='google'&&p.ready),apple:providers.some(p=>p.provider==='apple'&&p.ready),providers:providers.filter(p=>p.ready).map(p=>({provider:p.provider,name:p.name}))});});
socialRouter.post('/auth/:provider/start',limit(),async(req,res)=>{
 const p=await socialConfiguration(req.params.provider);assert(p.ready,503,'This sign-in provider is not available.');assert(!req.get('Origin')||req.get('Origin')===p.urls.application.value,400,'Open '+p.urls.application.value+' to use this sign-in provider.');
 const intent=req.body.intent||'login';assert(['login','connect','reauth'].includes(intent),400,'Invalid sign-in intent.');
 if(intent==='connect')await confirm(req);if(intent==='reauth')assert(req.user,401,'Please sign in.');
 const state=secretToken(),binding=secretToken(),nonce=secretToken(),verifier=p.provider==='google'?randomBytes(32).toString('base64url'):null;
 await pool.execute('INSERT INTO oauth_flows(state_hash,binding_hash,provider,nonce,verifier,callback_url,fingerprint,intent,user_id,session_id,return_to,expires_at)VALUES(?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[digest(state),digest(binding),p.provider,nonce,verifier,p.callback,p.fingerprint,intent,intent==='login'?null:req.user.id,intent==='login'?null:req.session.id,safePath(req.body.returnTo)]);
 const url=new URL(p.authorization);Object.entries({client_id:p.settings.client_id,redirect_uri:p.callback,response_type:'code',scope:p.provider==='google'?'openid email profile':'name email',state,nonce}).forEach(([k,v])=>url.searchParams.set(k,v));
 if(verifier){url.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url'));url.searchParams.set('code_challenge_method','S256');}else url.searchParams.set('response_mode','form_post');
 res.cookie(bindingName(p.provider),binding,bindingOptions(p.provider)).json({url:url.href});
});
async function callback(req,res){
 const provider=req.params.provider;assert(['google','apple'].includes(provider),404,'Sign-in provider not found.');
 assert(req.method===(provider==='apple'?'POST':'GET'),405,'Invalid callback method.');
 const input=req.method==='POST'?req.body:req.query,urls=await getAppUrls();
 try{
  assert(typeof input.state==='string'&&/^[a-f0-9]{64}$/.test(input.state),400,'Invalid sign-in state.');
  const binding=cookieValue(req,bindingName(provider));assert(binding,400,'Sign-in browser session expired.');
  const flow=await transaction(async db=>{const [[row]]=await db.execute('SELECT * FROM oauth_flows WHERE state_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[digest(input.state)]);assert(row&&row.provider===provider&&row.binding_hash===digest(binding),400,'Invalid or expired sign-in state.');await db.execute('DELETE FROM oauth_flows WHERE state_hash=?',[digest(input.state)]);return row;});
  const p=await socialConfiguration(provider,urls);assert(p.ready&&p.fingerprint===flow.fingerprint,400,'Sign-in configuration changed. Start again.');
  if(input.error){await auditRequest(req,{action:'social_login_failure',result:'failure',metadata:{provider,code:'cancelled'}});res.clearCookie(bindingName(provider),bindingOptions(provider));return res.redirect(303,buildApplicationUrl(urls,'/login?socialError=cancelled'));}
  const identity=await exchangeIdentity(p,flow,input.code),settings=await readSettings();
  if(provider==='apple'&&!identity.display_name&&typeof input.user==='string'){try{const name=JSON.parse(input.user).name;identity.display_name=[name?.firstName,name?.lastName].filter(x=>typeof x==='string').join(' ').replace(/[\x00-\x1f]/g,'').slice(0,200)||null;}catch{/* First-authorization name is optional display data, never account identity. */}}
  const result=await transaction(async db=>{
   await lock(db);
   assert((await socialConfiguration(provider)).fingerprint===flow.fingerprint,400,'Sign-in configuration changed. Start again.');
   if(flow.user_id){const [[session]]=await db.execute('SELECT s.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.expires_at>UTC_TIMESTAMP() AND u.status=\'ACTIVE\' FOR UPDATE',[flow.session_id,flow.user_id]);assert(session,401,'Your account session expired. Sign in again.');}
   const account=await resolveAccount(db,identity,{intent:flow.intent,userId:flow.user_id,registration:settings.features.registration,requestId:req.requestId});
   if(account.collision){const token=secretToken();await db.execute('INSERT INTO oauth_pending_links(token_hash,binding_hash,provider,identity_data,user_id,return_to,fingerprint,expires_at)VALUES(?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[digest(token),digest(binding),provider,JSON.stringify(identity),account.collision,flow.return_to,p.fingerprint]);return {token};}
   await startSession(db,account.user.id,req,res);await auditRequest(req,{actor:account.user,action:'social_login_success',targetType:'user',targetId:account.user.id,metadata:{provider}},db);return {};
  });
  if(result.token){res.cookie('tripsync_oauth_link',result.token,linkOptions());return res.redirect(303,buildApplicationUrl(urls,'/auth/link'));}
  res.clearCookie(bindingName(provider),bindingOptions(provider));res.redirect(303,buildApplicationUrl(urls,safePath(flow.return_to)));
 }catch{await auditRequest(req,{action:'social_login_failure',result:'failure',metadata:{provider}});res.redirect(303,buildApplicationUrl(urls,'/login?socialError=failed'));}
}
socialRouter.get('/auth/:provider/callback',limit(),callback);
socialRouter.post('/auth/:provider/callback',limit(),callback);
async function pending(req,db=pool,forUpdate=false){const token=cookieValue(req,'tripsync_oauth_link');assert(token,400,'The connection request expired.');const [[row]]=await db.execute('SELECT p.*,u.email FROM oauth_pending_links p JOIN users u ON u.id=p.user_id WHERE p.token_hash=? AND p.expires_at>UTC_TIMESTAMP()'+(forUpdate?' FOR UPDATE':''),[digest(token)]);assert(row&&row.attempts<5&&row.binding_hash===digest(cookieValue(req,bindingName(row.provider))),400,'The connection request expired.');return row;}
socialRouter.get('/auth/link-request',limit(),async(req,res)=>{const row=await pending(req);res.json({provider:row.provider,email:row.email});});
socialRouter.post('/auth/link-request',limit(),async(req,res)=>{
 const row=await pending(req),p=await socialConfiguration(row.provider);assert(p.ready&&p.fingerprint===row.fingerprint,400,'Sign-in configuration changed. Start again.');
 const result=await transaction(async db=>{await lock(db);const item=await pending(req,db,true);assert((await socialConfiguration(item.provider)).fingerprint===item.fingerprint,400,'Sign-in configuration changed. Start again.');const [[user]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[item.user_id]);assert(user?.status==='ACTIVE',403,'This account is not active.');if(!await verifyPassword(req.body.password,user.password_hash)){await db.execute('UPDATE oauth_pending_links SET attempts=attempts+1 WHERE token_hash=?',[item.token_hash]);return null;}
  await attachIdentity(db,user,typeof item.identity_data==='string'?JSON.parse(item.identity_data):item.identity_data,req.requestId);await db.execute('UPDATE users SET email_verified=TRUE WHERE id=?',[user.id]);await db.execute('DELETE FROM oauth_pending_links WHERE token_hash=?',[item.token_hash]);await startSession(db,user.id,req,res);await auditRequest(req,{actor:user,action:'social_login_success',targetType:'user',targetId:user.id,metadata:{provider:item.provider}},db);return item;
 });assert(result,401,'Incorrect password. You can reset your password or sign in with your existing method first.');res.clearCookie('tripsync_oauth_link',linkOptions()).clearCookie(bindingName(result.provider),bindingOptions(result.provider)).json({returnTo:safePath(result.return_to)});
});
socialRouter.get('/account/identities',requireUser,async(req,res)=>{const [identities]=await pool.execute('SELECT provider,provider_email,created_at,last_login_at FROM user_identities WHERE user_id=?',[req.user.id]);res.json({has_password:hasPassword(req.user),identities,recent_auth:!!recent(req)});});
socialRouter.post('/account/identities/:provider/disconnect',requireUser,limit(),async(req,res)=>{
 await confirm(req);const available=await Promise.all(['google','apple'].map(p=>socialConfiguration(p)));
 await transaction(async db=>{await lock(db);const [[user]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[req.user.id]);const [identities]=await db.execute('SELECT provider FROM user_identities WHERE user_id=?',[user.id]);assert(hasPassword(user)||identities.some(i=>i.provider!==req.params.provider&&available.some(p=>p.provider===i.provider&&p.ready)),409,'Add a password or another available sign-in method before disconnecting.');await db.execute('DELETE FROM user_identities WHERE user_id=? AND provider=?',[user.id,req.params.provider]);await db.execute('DELETE FROM sessions WHERE user_id=? AND id<>?',[user.id,req.session.id]);await auditRequest(req,{action:'social_identity_unlinked',targetType:'user',targetId:user.id,metadata:{provider:req.params.provider}},db);});res.json({ok:true});
});
socialRouter.post('/account/password/create',requireUser,limit(),async(req,res)=>{assert(recent(req),403,'Sign in again before adding a password.');const hash=await hashPassword(req.body.newPassword);await transaction(async db=>{await lock(db);const [[user]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[req.user.id]);assert(!hasPassword(user),409,'Use change password for an existing password.');await db.execute('UPDATE users SET password_hash=? WHERE id=?',[hash,user.id]);await db.execute('DELETE FROM sessions WHERE user_id=? AND id<>?',[user.id,req.session.id]);await auditRequest(req,{action:'account_password_created',targetType:'user',targetId:user.id},db);});res.json({ok:true});});
