import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,jwtVerify} from 'jose';
import {normalizeOrigin,resolveUrls,urlDetails,buildEmailVerificationUrl,buildPasswordResetUrl,buildShareUrl,buildPublicSiteUrl,safePath} from '../app-urls.js';
import {verifyIdentity,appleClientSecret} from '../social-auth/providers.js';
import {generateKeyPairSync} from 'node:crypto';

test('Domain normalization rejects credentials, paths, private hosts and insecure production origins',()=>{
 assert.equal(normalizeOrigin(' https://APP.Example.com/ ',true),'https://app.example.com');assert.equal(normalizeOrigin('http://localhost:5173',false),'http://localhost:5173');
 for(const value of ['http://example.com','https://name:password@example.com','https://example.com/path','https://example.com/?x=1','https://example.com/#x','https://127.0.0.1','https://localhost','https://192.168.1.1','https://host.local','javascript:alert(1)','https://example.com\\@evil.com'])assert.throws(()=>normalizeOrigin(value,true),value);
});
test('Every generated absolute URL follows alpha to beta; Admin overrides env and reset restores env',()=>{
 for(const [site,app]of [['https://alpha.example','https://portal.alpha.example'],['https://beta.example','https://my.beta.example']]){
  const urls=resolveUrls({}, {PUBLIC_SITE_URL:site,PUBLIC_APP_URL:app},true,'');const details=urlDetails(urls);
  for(const [key,path]of Object.entries({login:'/login',register:'/register',admin:'/admin',api:'/api',google:'/api/auth/google/callback',apple:'/api/auth/apple/callback'}))assert.equal(details.derived[key],app+path);
  assert.equal(new URL(buildEmailVerificationUrl(urls,'a@b.example')).origin,app);assert.equal(new URL(buildPasswordResetUrl(urls,'token','user')).origin,app);assert.equal(buildShareUrl(urls,'token'),app+'/share/token');assert.equal(buildPublicSiteUrl(urls),site+'/');
 }
 const env={PUBLIC_SITE_URL:'https://env-site.example',PUBLIC_APP_URL:'https://env-app.example'};const overrides={public_site_url:'https://admin-site.example',application_url:'https://admin-app.example'};assert.equal(resolveUrls(overrides,env,true,'').application.source,'Admin');assert.equal(resolveUrls(overrides,env,true,'').site.value,overrides.public_site_url);assert.equal(resolveUrls({},env,true,'').application.value,env.PUBLIC_APP_URL);assert.equal(resolveUrls({}, {},true,'').application.value,null);assert.equal(resolveUrls({}, {PUBLIC_APP_URL:'http://localhost:5173'},true,'').application.value,null);
});
test('OAuth return paths cannot redirect externally or into API routes',()=>{for(const value of ['//evil.example','/\\evil.example','/%2f%2fevil.example','https://evil.example','/api/auth/logout','/hello\nworld'])assert.equal(safePath(value),'/');assert.equal(safePath('/trip/123?tab=plan'),'/trip/123?tab=plan');});
test('Google and Apple JWT verification enforces signature, issuer, audience, nonce, age and verified email',async()=>{
 const keys=await generateKeyPair('RS256'),other=await generateKeyPair('RS256');
 const sign=async(changes={},key=keys.privateKey)=>new SignJWT({sub:'stable-subject',iss:'https://accounts.google.com',aud:'client',nonce:'nonce',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300,email:'a@sample.example',email_verified:true,...changes}).setProtectedHeader({alg:'RS256'}).sign(key);
 const verify=token=>verifyIdentity('google',token,{client_id:'client'},'nonce',keys.publicKey);assert.equal((await verify(await sign())).subject,'stable-subject');assert.equal((await verify(await sign({email_verified:false}))).email,null);
 for(const changes of [{nonce:'wrong'},{iss:'https://evil.example'},{aud:'other'},{exp:1},{iat:Math.floor(Date.now()/1000)-900},{azp:'other'},{aud:['client','other']}])await assert.rejects(verify(await sign(changes)));
 await assert.rejects(verify(await sign({},other.privateKey)));
 const apple=await verifyIdentity('apple',await sign({iss:'https://appleid.apple.com',email:'relay@privaterelay.appleid.com',email_verified:'true'}),{client_id:'client'},'nonce',keys.publicKey);assert.equal(apple.email,'relay@privaterelay.appleid.com');
 assert.equal((await verifyIdentity('apple',await sign({iss:'https://appleid.apple.com',email:undefined,email_verified:undefined}),{client_id:'client'},'nonce',keys.publicKey)).email,null);
});
test('Apple client secret is a short-lived ES256 JWT with the exact Services ID, team and key',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});const token=await appleClientSecret({client_id:'com.example.web',team_id:'TEAM123456',key_id:'KEY1234567'},privateKey.export({type:'pkcs8',format:'pem'}));const {payload,protectedHeader}=await jwtVerify(token,publicKey,{issuer:'TEAM123456',audience:'https://appleid.apple.com',algorithms:['ES256']});assert.equal(payload.sub,'com.example.web');assert.equal(protectedHeader.kid,'KEY1234567');assert(payload.exp-payload.iat<=300);
});
