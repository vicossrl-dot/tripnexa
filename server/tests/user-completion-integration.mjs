import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readdir,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
test('User completion: registration, private repair/undo, sessions, export and deletion',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
 assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/);process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';process.env.SMTP_HOST='';
 const {pool}=await import('../db.js'),{migrate}=await import('../migrate.js'),{config}=await import('../config.js'),{createApp}=await import('../app.js');
 config.googleMapsKey='';await migrate();const ids=[],mails=[],password='Fresh user regression password!';
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const id of ids){const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[id]);await pool.execute('DELETE FROM privacy_requests WHERE user_id=?',[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);for(const file of files)if(path.basename(file.filename)===file.filename)await unlink(path.join(config.uploads,file.filename)).catch(()=>{});}for(const file of mails)await unlink(file);await pool.end();});
 const call=async(url,body,cookie,method=body?'POST':'GET')=>{const r=await fetch(origin+'/api'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'TripSync',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const ok=async(...args)=>{const r=await call(...args);assert(r.status<400,JSON.stringify(r.data));return r.data;};
 const accounts=[];
 for(let n=0;n<2;n++){
  const email=randomUUID()+'@completion.test';assert.equal((await call('/auth/register',{email,password})).status,201);
  const [[user]]=await pool.execute('SELECT id FROM users WHERE email=?',[email]);ids.push(user.id);
  let code;for(const file of await readdir(config.outbox)){const filename=path.join(config.outbox,file),text=await readFile(filename,'utf8');if(text.includes('To: '+email)){code=text.match(/code: (\d{6})/)?.[1];mails.push(filename);}}
  assert(code);const verified=await call('/auth/verify',{email,otpCode:code});assert.equal(verified.status,200);accounts.push({email,cookie:verified.cookie});
 }
 const a=accounts[0].cookie,b=accounts[1].cookie;
 const trip=await ok('/entities/Trip',{name:'Five day regression',destination:'Rome',adults:1,start_date:'2026-10-05',end_date:'2026-10-09',special_wishes:'Quiet mornings',transport_preference:'mixed',food_preferences:'["Italian"]'},a);
 const base='/trips/'+trip.id;
 await ok('/entities/PlaceSelection',{trip_id:trip.id,name:'Required visit',priority:'mandatory',address:'Rome',lat:41.9,lng:12.5,desired_duration_min:60},a);
 const form=new FormData();form.append('file',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'private-ticket.pdf');const uploaded=await fetch(origin+'/api/uploads/wallet',{method:'POST',headers:{Cookie:a,'X-Requested-With':'TripSync'},body:form});assert.equal(uploaded.status,201);const file=await uploaded.json();
 await ok(base+'/wallet/items',{item:{title:'Private ticket',category:'place'},attachments:[file]},a);
 await ok(base+'/itinerary',{use_ai:false},a);
 await t.test('Owner checks cover health, preview, apply, undo and private files',async()=>{
  assert.equal((await call('/admin/session',null,a)).status,403);
  for(const [url,body]of [[base+'/health',null],[base+'/repair/preview',{}],[base+'/repair/apply',{token:'foreign'}],[base+'/repair/undo',{token:'foreign'}]])assert.equal((await call(url,body,b)).status,404,url);
  assert.equal((await fetch(origin+file.file_url,{headers:{Cookie:b}})).status,404);
 });
 await t.test('Preview does not write; stale apply cannot overwrite; repair and undo retain files/preferences',async()=>{
  const before=await ok(base+'/itinerary',null,a),wallet=await ok(base+'/wallet',null,a),preview=await ok(base+'/repair/preview',{},a);
  assert.deepEqual(await ok(base+'/itinerary',null,a),before);
  await ok('/entities/Trip/'+trip.id,{special_wishes:'Quiet mornings and breaks'},a,'PATCH');
  assert.equal((await call(base+'/repair/apply',{token:preview.token},a)).status,409);
  const fresh=await ok(base+'/repair/preview',{},a),applied=await ok(base+'/repair/apply',{token:fresh.token},a);
  assert.equal((await ok(base+'/health',null,a)).undoToken,applied.undoToken);
  assert.equal((await ok('/entities/Trip/'+trip.id,null,a)).special_wishes,'Quiet mornings and breaks');
  assert.deepEqual(await ok(base+'/wallet',null,a),wallet);
  assert.equal((await fetch(origin+file.file_url,{headers:{Cookie:a}})).status,200);
  await ok(base+'/repair/undo',{token:applied.undoToken},a);
  assert.deepEqual((await ok(base+'/itinerary',null,a)).items.map(i=>[i.title,i.date,i.start_time]),before.items.map(i=>[i.title,i.date,i.start_time]));
  assert.equal((await call(base+'/repair/undo',{token:applied.undoToken},a)).status,409);
  const next=await ok(base+'/repair/preview',{},a),saved=await ok(base+'/repair/apply',{token:next.token},a);
  await ok('/entities/Trip/'+trip.id,{special_wishes:'Another change'},a,'PATCH');assert.equal((await call(base+'/repair/undo',{token:saved.undoToken},a)).status,409);
 });
 await t.test('Public sharing excludes repair history, private Wallet and account details',async()=>{
  const shared=await ok(base+'/share',{enabled:true,hideStay:true},a),data=JSON.stringify(await ok('/shared/'+shared.share_token));
  for(const secret of ['Private ticket','private-ticket.pdf','itinerary_meta','previous_state','undoToken',accounts[0].email])assert(!data.includes(secret));
  assert.equal((await call(base+'/health')).status,401);
 });
 await t.test('Session revocation, account export and pending deletion require password',async()=>{
  const second=await call('/auth/login',{email:accounts[0].email,password});assert.equal(second.status,200);
  const sessions=await ok('/account/sessions',null,a);assert.equal(sessions.items.length,2);assert(!JSON.stringify(sessions).includes('token_hash'));
  assert.equal((await call('/account/sessions/revoke',{password:'wrong',confirmation:'REVOKE'},a)).status,403);
  await ok('/account/sessions/revoke',{password,confirmation:'REVOKE'},a);assert.equal((await call('/auth/me',null,second.cookie)).status,401);
  const exported=await ok('/account/export',{password},a);assert.equal(exported.records.Trip.length,1);assert(!JSON.stringify(exported).includes('password_hash'));assert(!JSON.stringify(exported).includes('share_token'));
  assert.equal((await call('/account/deletion',{password,confirmation:'wrong'},a)).status,400);
  await ok('/account/deletion',{password,confirmation:'DELETE MY ACCOUNT'},a);assert.equal((await ok('/account/deletion',null,a)).request.status,'PENDING');assert.equal((await call(base+'/health',null,a)).status,200);
  await ok('/account/password',{password,newPassword:'Changed strong regression password!'},a);assert.equal((await call('/auth/me',null,a)).status,401);
  assert.equal((await call('/auth/login',{email:accounts[0].email,password:'Changed strong regression password!'})).status,200);
 });
});
