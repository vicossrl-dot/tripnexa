import {randomUUID} from 'node:crypto';
import {assert} from '../errors.js';
import {audit} from '../admin/audit.js';
export const hasPassword=user=>typeof user?.password_hash==='string'&&user.password_hash.startsWith('scrypt:');
export async function attachIdentity(db,user,identity,requestId=null){
 const [existing]=await db.execute('SELECT user_id,provider_subject FROM user_identities WHERE provider=? AND (provider_subject=? OR user_id=?)',[identity.provider,identity.subject,user.id]);
 assert(existing.every(row=>row.user_id===user.id&&row.provider_subject===identity.subject),409,'This provider account is already connected. Use its original account or disconnect it first.');
 if(!existing.length){await db.execute('INSERT INTO user_identities(id,user_id,provider,provider_subject,provider_email,provider_email_verified,display_name,last_login_at)VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP(3))',[randomUUID(),user.id,identity.provider,identity.subject,identity.email,identity.email_verified,identity.display_name]);await audit(db,{actor:user,action:'social_identity_linked',targetType:'user',targetId:user.id,requestId,metadata:{provider:identity.provider}});}
}
// Caller holds the global social-identity lock and uses a transaction; email never silently merges identities.
export async function resolveAccount(db,identity,{intent='login',userId=null,registration=true,requestId=null}={}){
 const [[linked]]=await db.execute('SELECT u.* FROM user_identities i JOIN users u ON u.id=i.user_id WHERE i.provider=? AND i.provider_subject=? FOR UPDATE',[identity.provider,identity.subject]);
 if(linked){assert(linked.status==='ACTIVE',403,'This account is not active.');assert(!userId||linked.id===userId,409,'Choose the provider account connected to this account.');await db.execute('UPDATE user_identities SET last_login_at=UTC_TIMESTAMP(3) WHERE provider=? AND provider_subject=?',[identity.provider,identity.subject]);return {user:linked};}
 assert(intent!=='reauth',403,'Choose a provider account already connected to your account.');
 if(intent==='connect'){
  const [[user]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[userId]);assert(user?.status==='ACTIVE'&&user.email_verified,403,'Verify your account before connecting a provider.');
  await attachIdentity(db,user,identity,requestId);return {user};
 }
 assert(identity.email_verified&&identity.email,403,'A verified provider email is required to create an account.');
 const [[existing]]=await db.execute('SELECT * FROM users WHERE email=? FOR UPDATE',[identity.email]);
 if(existing){assert(existing.status==='ACTIVE',403,'This account is not active.');return {collision:existing.id};}
 assert(registration,403,'New account registration is currently unavailable.');
 const user={id:randomUUID(),email:identity.email,role:'USER',status:'ACTIVE',email_verified:true};
 await db.execute("INSERT INTO users(id,email,password_hash,email_verified,display_name,role,status)VALUES(?,?,NULL,TRUE,?,'USER','ACTIVE')",[user.id,user.email,identity.display_name]);
 await attachIdentity(db,user,identity,requestId);return {user};
}
