import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import * as OTPAuth from 'otpauth';
test('MySQL administrator foundation: roles, MFA encryption/replay/recovery, suspension, owner isolation and audit',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
 assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/);process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.ADMIN_SECRETS_MASTER_KEY=randomBytes(32).toString('hex');process.env.NODE_ENV='test';
 const {pool}=await import('../db.js'),{migrate}=await import('../migrate.js'),{hashPassword}=await import('../security.js'),{createApp}=await import('../app.js');
 await migrate();await migrate();const ids=[randomUUID(),randomUUID(),randomUUID()],roles=['USER','ADMIN','SUPER_ADMIN'];const password='Administrator integration password!';
 for(let i=0;i<ids.length;i++)await pool.execute('INSERT INTO users(id,email,password_hash,email_verified,role)VALUES(?,?,?,TRUE,?)',[ids[i],ids[i]+'@example.test',await hashPassword(password),roles[i]]);
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const id of ids){await pool.execute('DELETE FROM users WHERE id=?',[id]);await pool.execute('DELETE FROM audit_events WHERE actor_user_id=? OR target_id=?',[id,id]);}await pool.end();});
 const call=async(path,method='GET',body=undefined,cookie='')=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Cookie:cookie,'X-Requested-With':'TripSync','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const sessions=[];for(const id of ids){const r=await call('/auth/login','POST',{email:id+'@example.test',password});assert.equal(r.status,200);sessions.push(r.cookie);}
 assert.equal((await call('/admin/session')).status,401);assert.equal((await call('/admin/session','GET',undefined,sessions[0])).status,403);assert.equal((await call('/admin/session','GET',undefined,sessions[1])).status,403);
 assert.equal((await call('/auth/me','PATCH',{role:'SUPER_ADMIN'},sessions[0])).status,400);
 for(const i of [1,2]){
  const setup=await call('/admin/mfa/setup','POST',{password},sessions[i]);assert.equal(setup.status,200);assert(setup.data.qr.startsWith('data:image/png;base64,'));
  const otp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(setup.data.secret)}).generate();
  const result=await call('/admin/mfa/confirm','POST',{password,code:otp},sessions[i]);assert.equal(result.status,200);assert.equal(result.data.recoveryCodes.length,10);
  const [mfa]=await pool.execute('SELECT encrypted_secret,recovery_hashes FROM admin_mfa WHERE user_id=?',[ids[i]]);assert(!JSON.stringify(mfa).includes(setup.data.secret));assert(!JSON.stringify(mfa).includes(result.data.recoveryCodes[0]));
  assert.equal((await call('/admin/session','GET',undefined,sessions[i])).status,200);
  assert.equal((await call('/admin/mfa/verify','POST',{password,code:otp},sessions[i])).status,401);
  assert.equal((await call('/admin/mfa/verify','POST',{password,code:result.data.recoveryCodes[0]},sessions[i])).status,200);
  assert.equal((await call('/admin/mfa/verify','POST',{password,code:result.data.recoveryCodes[0]},sessions[i])).status,401);
  const status=await call('/admin/mfa/status','GET',undefined,sessions[i]);assert(!JSON.stringify(status).includes(setup.data.secret));
 }
 const trip=await call('/entities/Trip','POST',{name:'Private user trip'},sessions[0]);assert.equal(trip.status,201);
 assert.equal((await call('/entities/Trip/'+trip.data.id,'GET',undefined,sessions[2])).status,404);
 for(const route of ['/admin/overview','/admin/users','/admin/trips','/admin/health','/admin/audit','/admin/logs','/admin/analytics','/admin/providers/status','/admin/files','/admin/storage','/admin/file-grants','/admin/settings','/admin/features','/admin/quotas']){
  assert.equal((await call(route,'GET',undefined,sessions[0])).status,403,route);
  const response=await call(route,'GET',undefined,sessions[1]);assert.equal(response.status,200,JSON.stringify(response));assert(!JSON.stringify(response.data).includes('password_hash'));
 }
 await t.test('Versioned feature policies apply to normal HTTP requests',async()=>{
  const key='ai_trip_names',[[previous]]=await pool.execute('SELECT * FROM feature_flags WHERE setting_key=?',[key]);
  try{
   const change={value:false,version:previous?.version||0,reason:'Integration feature policy',confirmation:'SAVE'};
   assert.equal((await call('/admin/features/'+key,'POST',change,sessions[1])).status,403);
   assert.equal((await call('/admin/features/'+key,'POST',change,sessions[2])).status,200);
   assert.equal((await call('/admin/features/'+key,'POST',change,sessions[2])).status,409);
   assert.equal((await call('/ai/trip-names','POST',{},sessions[0])).status,503);
   assert.equal((await call('/config')).data.features[key],false);
  }finally{
   await pool.execute('DELETE FROM feature_flags WHERE setting_key=?',[key]);
   if(previous)await pool.execute('INSERT INTO feature_flags(setting_key,value,version,updated_by)VALUES(?,?,?,?)',[key,JSON.stringify(typeof previous.value==='string'?JSON.parse(previous.value):previous.value),previous.version,previous.updated_by]);
   await pool.execute('DELETE FROM settings_history WHERE updated_by=?',[ids[2]]);
  }
 });
 await t.test('Concurrent quota reservations cannot exceed the configured limit',async()=>{
  const {consumeCounter}=await import('../admin/runtime.js');
  try{
   const results=await Promise.allSettled(Array.from({length:5},()=>consumeCounter(ids[0],'test','today',2)));
   assert.equal(results.filter(result=>result.status==='fulfilled').length,2);
   for(const result of results)if(result.status==='rejected')assert.equal(result.reason.status,429);
  }finally{await pool.execute('DELETE FROM usage_counters WHERE scope=?',[ids[0]]);}
 });
 await t.test('File inventory is metadata-only and grants require another administrator',async()=>{
  const file=randomUUID(),filename=file+'.pdf';
  await pool.execute('INSERT INTO uploads(id,owner_id,filename,mime,size_bytes)VALUES(?,?,?,?,?)',[file,ids[0],filename,'application/pdf',12]);
  try{
   const inventory=await call('/admin/files?q='+file,'GET',undefined,sessions[1]);
   assert.equal(inventory.status,200);assert.equal(inventory.data.items.length,1);
   assert.equal(inventory.data.items[0].physical_status,'missing');
   assert(!JSON.stringify(inventory.data).includes(filename));
   const body={file_id:file,reason:'Integration exceptional access',confirmation:'REQUEST'};
   const own=await call('/admin/file-grants','POST',body,sessions[2]);assert.equal(own.status,200);
   const approve={reason:'Integration independent approval',confirmation:'APPROVE'};
   assert.equal((await call('/admin/file-grants/'+own.data.id+'/approve','POST',approve,sessions[2])).status,403);
   const request=await call('/admin/file-grants','POST',body,sessions[1]);assert.equal(request.status,200);
   const base='/admin/file-grants/'+request.data.id;
   assert.equal((await call(base+'/content','GET',undefined,sessions[1])).status,403);
   assert.equal((await call(base+'/approve','POST',approve,sessions[1])).status,403);
   assert.equal((await call(base+'/approve','POST',approve,sessions[2])).status,200);
   assert.equal((await call(base+'/content','GET',undefined,sessions[2])).status,403);
   assert.equal((await call(base+'/content','GET',undefined,sessions[1])).status,404);
   assert.equal((await call(base+'/revoke','POST',{reason:'Integration access revoked',confirmation:'REVOKE'},sessions[2])).status,200);
   assert.equal((await call(base+'/content','GET',undefined,sessions[1])).status,403);
  }finally{await pool.execute('DELETE FROM file_access_grants WHERE file_id=?',[file]);await pool.execute('DELETE FROM uploads WHERE id=?',[file]);}
 });
 const privilegedMutation={reason:'Integration security verification',confirmation:'ROLE',role:'SUPER_ADMIN'};
 assert.equal((await call('/admin/users/'+ids[1]+'/role','POST',privilegedMutation,sessions[1])).status,403);
 assert.equal((await call('/admin/users/'+ids[2]+'/role','POST',{...privilegedMutation,role:'USER'},sessions[2])).status,409);
 assert.equal((await call('/admin/users/'+ids[2]+'/suspend','POST',{reason:'Integration permission check',confirmation:'SUSPEND'},sessions[1])).status,403);
 assert.equal((await call('/admin/users/'+ids[0]+'/suspend','POST',{reason:'Integration user suspension',confirmation:'SUSPEND'},sessions[1])).status,200);
 assert.equal((await call('/auth/me','GET',undefined,sessions[0])).status,401);
 assert.equal((await call('/admin/users/'+ids[0]+'/reactivate','POST',{reason:'Integration user reactivation',confirmation:'REACTIVATE'},sessions[1])).status,200);
 const restored=await call('/auth/login','POST',{email:ids[0]+'@example.test',password});assert.equal(restored.status,200);sessions[0]=restored.cookie;
 await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[ids[0]]);assert.equal((await call('/auth/me','GET',undefined,sessions[0])).status,401);assert.equal((await call('/auth/login','POST',{email:ids[0]+'@example.test',password})).status,403);
 const [audit]=await pool.execute('SELECT action,result,metadata_redacted FROM audit_events WHERE actor_user_id=?',[ids[1]]);assert(audit.some(r=>r.action==='mfa.enrolled'));assert(audit.some(r=>r.result==='failure'));assert(!JSON.stringify(audit).includes(password));
});
