import {createRemoteJWKSet,jwtVerify,SignJWT,importPKCS8,customFetch} from 'jose';
import {pool} from '../db.js';
import {config} from '../config.js';
import {decryptSecret} from '../admin/crypto.js';
import {getAppUrls,buildOAuthCallback,resolveUrls} from '../app-urls.js';
import {assert} from '../errors.js';
import {digest,normalizeEmail} from '../security.js';
export const providerDefinitions={
 google:{name:'Google',authorization:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',jwks:'https://www.googleapis.com/oauth2/v3/certs',issuer:['https://accounts.google.com','accounts.google.com'],secret:'GOOGLE_OAUTH_CLIENT_SECRET',help:'https://developers.google.com/identity/openid-connect/openid-connect'},
 apple:{name:'Apple',authorization:'https://appleid.apple.com/auth/authorize',token:'https://appleid.apple.com/auth/token',jwks:'https://appleid.apple.com/auth/keys',issuer:'https://appleid.apple.com',secret:'APPLE_PRIVATE_KEY',help:'https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/'},
};
const jwks=Object.fromEntries(Object.entries(providerDefinitions).map(([id,p])=>[id,createRemoteJWKSet(new URL(p.jwks),{timeoutDuration:8000,cacheMaxAge:600000,[customFetch]:(...args)=>fetch(...args)})]));
export async function providerSecret(name){const [[row]]=await pool.execute('SELECT encrypted_value,version,updated_at FROM managed_secrets WHERE secret_name=?',[name]);let value='';try{value=row?decryptSecret(row.encrypted_value,'provider:'+name):process.env[name]||'';}catch{/* Configured but unusable encryption fails closed. */}return {value,configured:!!row||!!process.env[name],version:row?.version||0,updated_at:row?.updated_at||null};}
export async function socialConfiguration(provider,urls=undefined){
 const def=Object.hasOwn(providerDefinitions,provider)?providerDefinitions[provider]:null;assert(def,404,'Sign-in provider not found.');urls??=await getAppUrls();
 const [[row]]=await pool.execute('SELECT * FROM social_providers WHERE provider=?',[provider]);
 const defaults=provider==='google'?{client_id:process.env.GOOGLE_OAUTH_CLIENT_ID||''}:{client_id:process.env.APPLE_SERVICE_ID||'',team_id:process.env.APPLE_TEAM_ID||'',key_id:process.env.APPLE_KEY_ID||''};
 const saved=row?(typeof row.config==='string'?JSON.parse(row.config):row.config):null;
 const callback=urls.application.value?buildOAuthCallback(urls,provider):null;
 let confirmedCallback=callback;
 if(!saved&&defaults.client_id&&callback){await pool.execute('INSERT IGNORE INTO oauth_callback_baselines(provider,callback_url)VALUES(?,?)',[provider,callback]);const [[baseline]]=await pool.execute('SELECT callback_url FROM oauth_callback_baselines WHERE provider=?',[provider]);confirmedCallback=baseline?.callback_url||null;}
 const settings=saved||{...defaults,enabled:!!defaults.client_id,confirmed_callback:confirmedCallback};
 const secret=await providerSecret(def.secret);
 const configured=!!(settings.client_id&&secret.value&&(provider!=='apple'||settings.team_id&&settings.key_id));
 const domainReady=!!callback&&(provider!=='apple'||callback.startsWith('https:')&&!['localhost','127.0.0.1','[::1]'].includes(new URL(callback).hostname));
 const requiresUpdate=!!settings.client_id&&settings.confirmed_callback!==callback;
 const ready=!!settings.enabled&&configured&&domainReady&&!requiresUpdate;
 const status=!settings.enabled?'Disabled':requiresUpdate?'Requires provider update':!configured?'Not configured':!domainReady?'Domain configuration required':'Ready';
 return {provider,...def,settings,secret,callback,urls,configured,ready,status,requiresUpdate,version:row?.version||0,source:row?'Admin':'env',last_test:row?.last_test||null,tested_at:row?.tested_at||null,fingerprint:digest(JSON.stringify([settings,callback,secret.version,digest(secret.value)]))};
}
export function publicProvider(p){const local=resolveUrls();const localCallback=!config.production&&local.application.value&&['localhost','127.0.0.1','[::1]'].includes(new URL(local.application.value).hostname)?buildOAuthCallback(local,p.provider):null;return {application_url:p.urls.application.value,local_callback:localCallback,provider:p.provider,name:p.name,settings:p.settings,callback:p.callback,domain:p.urls.application.value?new URL(p.urls.application.value).hostname:null,status:p.status,ready:p.ready,version:p.version,source:p.source,secret_configured:p.secret.configured,secret_version:p.secret.version,secret_updated_at:p.secret.updated_at,last_test:p.last_test,tested_at:p.tested_at,help:p.help};}
export async function appleClientSecret(settings,key){
 const privateKey=await importPKCS8(key.replace(/\\n/g,'\n'),'ES256');
 return new SignJWT({}).setProtectedHeader({alg:'ES256',kid:settings.key_id}).setIssuer(settings.team_id).setAudience('https://appleid.apple.com').setSubject(settings.client_id).setIssuedAt().setExpirationTime('5m').sign(privateKey);
}
export async function verifyIdentity(provider,idToken,configuration,nonce,keyResolver=jwks[provider]){
 assert(typeof idToken==='string'&&idToken.length<=20000,400,'Provider identity could not be verified.');
 const {payload}=await jwtVerify(idToken,keyResolver,{issuer:providerDefinitions[provider].issuer,audience:configuration.client_id,algorithms:['RS256'],requiredClaims:['sub','iss','aud','exp','iat','nonce'],clockTolerance:5,maxTokenAge:'10m'});
 assert(payload.nonce===nonce&&typeof payload.sub==='string'&&/^[\x21-\x7e]{1,255}$/.test(payload.sub)&&payload.iat<=Math.floor(Date.now()/1000)+5,400,'Provider identity could not be verified.');
 assert((!payload.azp||payload.azp===configuration.client_id)&&(!Array.isArray(payload.aud)||payload.aud.length===1||payload.azp===configuration.client_id),400,'Provider identity could not be verified.');
 const verified=payload.email_verified===true||payload.email_verified==='true';
 let email=null;if(payload.email&&verified)email=normalizeEmail(payload.email);
 return {provider,subject:payload.sub,email,email_verified:!!email&&verified,display_name:typeof payload.name==='string'?payload.name.replace(/[\x00-\x1f]/g,'').slice(0,200):null};
}
export async function exchangeIdentity(p,flow,code){
 assert(typeof code==='string'&&code.length>0&&code.length<=4096,400,'Invalid sign-in response.');
 const clientSecret=p.provider==='apple'?await appleClientSecret(p.settings,p.secret.value):p.secret.value;
 const form=new URLSearchParams({grant_type:'authorization_code',code,client_id:p.settings.client_id,client_secret:clientSecret,redirect_uri:flow.callback_url});
 if(p.provider==='google')form.set('code_verifier',flow.verifier);
 const response=await fetch(p.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(12000),redirect:'error'});
 assert(response.ok,401,'Provider sign-in could not be completed.');
 const data=await response.json();return verifyIdentity(p.provider,data.id_token,p.settings,flow.nonce);
}
