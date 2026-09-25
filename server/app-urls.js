import {isIP} from 'node:net';
import {pool} from './db.js';
import {config} from './config.js';
import {assert} from './errors.js';
export function normalizeOrigin(value,production=config.production){
 assert(typeof value==='string'&&value.trim().length<=500&&!/[\\\x00-\x1f]/.test(value),400,'Enter a valid root website URL.');
 let url;try{url=new URL(value.trim());}catch{assert(false,400,'Enter a valid website URL.');}
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 assert(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/',400,'Use a root origin without credentials, path, query or fragment.');
 assert(url.protocol==='https:'||!production&&local&&url.protocol==='http:',400,'HTTPS is required, except for local development.');
 assert(!production||!local,400,'Production URLs cannot use localhost.');
 assert(local||!isIP(url.hostname)&&/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname)&&!url.hostname.endsWith('.localhost')&&!url.hostname.endsWith('.local'),400,'Enter a public hostname.');
 return url.origin;
}
export function safePath(raw='/'){
 if(typeof raw!=='string'||raw.length>2000||!raw.startsWith('/')||raw.startsWith('//')||/[\\\x00-\x20]/.test(raw)||/%(?:2f|5c|0[ad])/i.test(raw.split(/[?#]/)[0]))return '/';
 const url=new URL(raw,'https://internal.invalid');
 if(url.origin!=='https://internal.invalid'||url.pathname.startsWith('//')||/^\/api(?:\/|$)/.test(url.pathname))return '/';
 return url.pathname+url.search+url.hash;
}
export function resolveUrls(overrides={},env=process.env,production=config.production,legacy=config.appUrl){
 const fallback=!production?(legacy||'http://127.0.0.1:5173'):legacy||'';
 const select=(db,environment,otherwise)=>{
  const value=db||environment||otherwise||'',source=db?'Admin':environment?'env':otherwise?'development fallback':'missing';
  try{return {value:normalizeOrigin(value,production),source,error:null};}catch{return {value:null,source,error:'A valid '+(production?'HTTPS ':'')+'root URL is required.'};}
 };
 const application=select(overrides.application_url,env.PUBLIC_APP_URL||env.APP_URL,fallback);
 const site=select(overrides.public_site_url,env.PUBLIC_SITE_URL,production?'':application.value);
 return {application,site,version:overrides.version||0,overrides:{application_url:overrides.application_url||'',public_site_url:overrides.public_site_url||''}};
}
export async function getAppUrls(){const [[row]]=await pool.query('SELECT public_site_url,application_url,version FROM application_urls WHERE id=1');return resolveUrls(row||{});}
export function buildApplicationUrl(urls,path='/'){
 assert(urls.application.value,503,'Application URL is not configured.');assert(typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!/[\\\x00-\x20]/.test(path),400,'Invalid application path.');
 const url=new URL(path,urls.application.value);assert(url.origin===urls.application.value,400,'Invalid application origin.');return url.href;
}
export function buildPublicSiteUrl(urls,path='/'){return buildApplicationUrl({application:urls.site},path);}
export const getPublicSiteUrl=urls=>urls.site.value;
export const getApplicationUrl=urls=>urls.application.value;
export const getApiBaseUrl=urls=>buildApplicationUrl(urls,'/api');
export const buildOAuthCallback=(urls,provider)=>{assert(['google','apple'].includes(provider),400,'Unsupported sign-in provider.');return buildApplicationUrl(urls,`/api/auth/${provider}/callback`);};
export const buildEmailVerificationUrl=(urls,email)=>buildApplicationUrl(urls,'/register?verifyEmail='+encodeURIComponent(email));
export const buildPasswordResetUrl=(urls,token,user)=>buildApplicationUrl(urls,'/reset-password?'+new URLSearchParams({token,user}));
export const buildShareUrl=(urls,token)=>buildApplicationUrl(urls,'/share/'+encodeURIComponent(token));
export function urlDetails(urls){
 const derived={};if(urls.application.value)for(const [key,p]of Object.entries({login:'/login',register:'/register',admin:'/admin',api:'/api',google:'/api/auth/google/callback',apple:'/api/auth/apple/callback'}))derived[key]=buildApplicationUrl(urls,p);
 return {...urls,derived,appleDomain:urls.application.value?new URL(urls.application.value).hostname:null,https:!!urls.application.value?.startsWith('https:'),sameOrigin:!!urls.site.value&&urls.site.value===urls.application.value};
}
export function allowedOrigins(urls){
 const origins=new Set(urls.application.value?[urls.application.value]:[]);
 if(!config.production){for(const host of ['localhost','127.0.0.1'])origins.add(`http://${host}:${config.port}`);if(urls.application.value){const u=new URL(urls.application.value);if(['localhost','127.0.0.1'].includes(u.hostname))for(const host of ['localhost','127.0.0.1'])origins.add(`${u.protocol}//${host}${u.port?':'+u.port:''}`);}}
 return origins;
}
