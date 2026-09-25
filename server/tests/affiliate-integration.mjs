import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {unlink} from 'node:fs/promises';
import path from 'node:path';
test('Affiliate marketplace: permissions, four-provider matrix, wallet, sharing and analytics',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
 assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/);process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';process.env.ADMIN_SECRETS_MASTER_KEY=randomBytes(32).toString('hex');
 const {pool}=await import('../db.js'),{migrate}=await import('../migrate.js'),{createApp}=await import('../app.js'),{hashPassword}=await import('../security.js'),{config}=await import('../config.js');
 config.googleMapsKey='';await migrate();await migrate();
 const [prior]=await pool.query('SELECT * FROM affiliate_providers'),[oldSecrets]=await pool.query("SELECT * FROM managed_secrets WHERE secret_name='VIATOR_API_KEY'");
 const ids=[randomUUID(),randomUUID(),randomUUID()],password='Affiliate test password 123!',prefix=randomUUID();const roles=['USER','ADMIN','SUPER_ADMIN'];
 for(let i=0;i<ids.length;i++)await pool.execute('INSERT INTO users(id,email,password_hash,email_verified,role)VALUES(?,?,?,TRUE,?)',[ids[i],ids[i]+'@affiliate.test',await hashPassword(password),roles[i]]);
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const call=async(route,cookie,body,method=body?'POST':'GET')=>{const r=await fetch(origin+'/api'+route,{method,headers:{Cookie:cookie||'','Content-Type':'application/json','X-Requested-With':'TripSync'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const ok=async(...args)=>{const r=await call(...args);assert(r.status<400,JSON.stringify(r.data));return r.data;};
 const cookies=[];for(const id of ids)cookies.push((await call('/auth/login','',{email:id+'@affiliate.test',password})).cookie);
 for(const id of ids.slice(1))await pool.execute('UPDATE sessions SET mfa_verified_at=UTC_TIMESTAMP(3) WHERE user_id=?',[id]);
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));await pool.query('DELETE FROM affiliate_providers');for(const p of prior)await pool.execute('INSERT INTO affiliate_providers(provider,config,version,last_check,checked_at,updated_by)VALUES(?,?,?,?,?,?)',[p.provider,JSON.stringify(p.config),p.version,p.last_check?JSON.stringify(p.last_check):null,p.checked_at,p.updated_by]);await pool.execute('DELETE FROM affiliate_place_mappings WHERE created_by IN (?,?,?)',ids);await pool.execute('DELETE FROM affiliate_place_overrides WHERE google_place_id LIKE ?',[prefix+'%']);await pool.execute("DELETE FROM managed_secrets WHERE secret_name='VIATOR_API_KEY'");for(const s of oldSecrets)await pool.execute('INSERT INTO managed_secrets(secret_name,provider,encrypted_value,version,updated_by)VALUES(?,?,?,?,?)',[s.secret_name,s.provider,JSON.stringify(s.encrypted_value),s.version,s.updated_by]);for(const id of ids){const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[id]);await pool.execute('DELETE FROM affiliate_click_events WHERE trip_id IN (SELECT id FROM trips WHERE owner_id=?)',[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);await pool.execute('DELETE FROM audit_events WHERE actor_user_id=?',[id]);await pool.execute('DELETE FROM settings_history WHERE updated_by=?',[id]);for(const f of files)if(path.basename(f.filename)===f.filename)await unlink(path.join(config.uploads,f.filename)).catch(()=>{});}await pool.end();});
 const [user,admin,superAdmin]=cookies;
 const trip=await ok('/entities/Trip',user,{name:'Affiliate fixture trip',destination:'Barcelona',country:'Spain',adults:1,start_date:'2026-10-05',end_date:'2026-10-09'});
 const names=['Sagrada Familia','Colosseum','Louvre Museum','Eiffel Tower','Generic free park'],cities=['Barcelona','Rome','Paris','Paris','Barcelona'],countries=['Spain','Italy','France','France','Spain'];
 const places=[];for(let i=0;i<names.length;i++)places.push(await ok('/entities/PlaceSelection',user,{trip_id:trip.id,name:names[i],place_id:prefix+'-'+i,city:cities[i],country:countries[i],category:i===4?'park':i===2?'museum':'tourist_attraction',priority:'mandatory',lat:41.4+i*.001,lng:2.17,address:'Public test location'}));
 const plan=await ok('/trips/'+trip.id+'/itinerary',user,{use_ai:false});const visits=places.map(p=>plan.items.find(i=>i.selection_id===p.id));assert(visits.every(Boolean));
 const base=i=>'/trips/'+trip.id+'/tickets/'+visits[i].id;
 let providerRows;
 await t.test('Owner scope, MFA, SUPER_ADMIN configuration and version conflicts',async()=>{
  assert.equal((await call('/admin/affiliates/providers',user)).status,403);assert.equal((await call(base(0),admin)).status,404);assert.equal((await call(base(0))).status,401);
  providerRows=(await ok('/admin/affiliates/providers',admin)).providers;
  for(const p of providerRows){const body={config:{...p.config,enabled:true},version:p.version,reason:'Configure isolated fixture provider',confirmation:'SAVE'};assert.equal((await call('/admin/affiliates/providers/'+p.id,admin,body,'PUT')).status,403);await ok('/admin/affiliates/providers/'+p.id,superAdmin,body,'PUT');assert.equal((await call('/admin/affiliates/providers/'+p.id,superAdmin,body,'PUT')).status,409);}
  const bad={...providerRows[0].config,allowed_hosts:['evil.test']};assert.equal((await call('/admin/affiliates/providers/getyourguide',superAdmin,{config:bad,version:0,reason:'Reject arbitrary host',confirmation:'SAVE'},'PUT')).status,400);
 });
 await t.test('Four exact attraction mappings for each of four providers; free park hidden',async()=>{
  for(let i=0;i<4;i++)for(const p of providerRows){const tracking=p.id==='getyourguide'?'partner_id=TEST_ONLY':p.id==='viator'?'pid=PTEST&mcid=123&medium=link':'affiliate_fixture=TEST_ONLY';const mapping={provider:p.id,google_place_id:places[i].place_id,canonical_place_name:names[i],city:cities[i],country:countries[i],affiliate_url:'https://www.'+p.root+'/fixture-'+i+'?'+tracking,enabled:true,priority:0};await ok('/admin/affiliates/mappings',admin,{mapping,official_link_confirmed:true,reason:'Exact isolated fixture mapping',confirmation:'SAVE'});}
  for(let i=0;i<4;i++){const result=await ok(base(i),user);assert(result.ticketable);assert.deepEqual(result.providers.map(p=>p.provider),['getyourguide','viator','tiqets','klook']);assert(result.providers.every(p=>p.confidence==='EXACT'));assert(!JSON.stringify(result).includes('encrypted_value'));}
  assert.equal((await ok(base(4),user)).ticketable,false);
  const r=await call('/admin/affiliates/mappings',admin,{mapping:{provider:'viator',google_place_id:prefix,canonical_place_name:'Bad',city:'Rome',country:'Italy',affiliate_url:'https://evil.test',enabled:true,priority:0},reason:'Reject hostile mapping',confirmation:'SAVE',official_link_confirmed:true});assert.equal(r.status,400);
 });
 await t.test('Write-only encrypted credentials never appear in user or admin responses',async()=>{
  const before=(await ok('/admin/secrets',superAdmin)).items.find(s=>s.name==='VIATOR_API_KEY');const secret='synthetic-secret-'+randomUUID();
  await ok('/admin/secrets/VIATOR_API_KEY',superAdmin,{value:secret,test:false,version:before.version,reason:'Test write-only encrypted storage',confirmation:'REPLACE'});
  const [[stored]]=await pool.execute("SELECT encrypted_value FROM managed_secrets WHERE secret_name='VIATOR_API_KEY'");assert(!JSON.stringify(stored).includes(secret));
  for(const route of ['/admin/secrets','/admin/affiliates/providers',base(0)]){const result=await ok(route,route.startsWith('/admin')?superAdmin:user);assert(!JSON.stringify(result).includes(secret));assert(!JSON.stringify(result).includes('encrypted_value'));}
 });
 await t.test('Manual booked state and linked private ticket update without regeneration',async()=>{
  const version=(await ok('/trips/'+trip.id+'/itinerary',user)).version;
  assert.equal((await call(base(0)+'/booked',admin,{booked:true})).status,404);
  await ok(base(0)+'/booked',user,{booked:true,provider:'viator'});assert.equal((await ok(base(0),user)).booking.booked,true);
  const linked=await ok(base(0)+'/wallet',user,{});assert.equal((await ok(base(0)+'/wallet',user,{})).item_id,linked.item_id);
  const QRCode=(await import('qrcode')).default;const png=await QRCode.toBuffer('SYNTHETIC TICKET NOT VALID');const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'private-test-qr.png');const uploaded=await fetch(origin+'/api/uploads/wallet',{method:'POST',headers:{Cookie:user,'X-Requested-With':'TripSync'},body:form});assert.equal(uploaded.status,201);const file=await uploaded.json();
  await ok('/trips/'+trip.id+'/wallet/items/'+linked.item_id,user,{item:{category:'place',title:names[0]},attachments:[file]},'PATCH');
  const result=await ok(base(0),user);assert(result.booking.saved);assert.equal(result.booking.wallet_item_id,linked.item_id);assert.equal((await ok('/trips/'+trip.id+'/itinerary',user)).version,version);assert.equal((await fetch(origin+file.file_url,{headers:{Cookie:admin}})).status,404);
 });
 await t.test('Public sharing omits private booking metadata; click is never reported as sale',async()=>{
  const shared=await ok('/trips/'+trip.id+'/share',user,{enabled:true,hideStay:true});const token=shared.token||shared.share_token||shared.url?.split('/').pop();assert(token,JSON.stringify(shared));
  const publicBase='/shared/'+token+'/tickets/'+visits[0].id;const result=await ok(publicBase);assert.equal(result.booking,undefined);assert(!JSON.stringify(result).includes('wallet'));assert(!JSON.stringify(result).includes('owner_id'));assert.equal(result.providers.length,4);
  await ok(base(0)+'/click',user,{provider:'viator'});await ok(publicBase+'/click',null,{provider:'getyourguide'});const stats=await ok('/admin/affiliates/analytics',admin);assert(stats.totals.clicks>=2);assert.equal(stats.sales,null);assert.equal(stats.revenue,null);
  await ok('/trips/'+trip.id+'/share',user,{enabled:false,hideStay:true});assert.equal((await call(publicBase)).status,404);
 });
 await t.test('Visibility override and isolated provider failures',async()=>{
  await ok('/admin/affiliates/overrides/'+places[0].place_id,admin,{mode:'NEVER',version:0,reason:'Hide ticket CTA fixture',confirmation:'SAVE'},'PUT');assert.equal((await ok(base(0),user)).ticketable,false);
  const p=(await ok('/admin/affiliates/providers',admin)).providers.find(p=>p.id==='viator');await ok('/admin/affiliates/providers/viator',superAdmin,{config:{...p.config,enabled:false},version:p.version,reason:'Isolate unavailable provider fixture',confirmation:'SAVE'},'PUT');assert.equal((await ok(base(1),user)).providers.length,3);
  const k=(await ok('/admin/affiliates/providers',admin)).providers.find(p=>p.id==='klook');await ok('/admin/affiliates/providers/klook',superAdmin,{config:{...k.config,allowed_hosts:['klook.com']},version:k.version,reason:'Invalidate one provider link fixture',confirmation:'SAVE'},'PUT');const isolated=await ok(base(1),user);assert.equal(isolated.providers.filter(p=>p.url).length,2);assert(isolated.providers.find(p=>p.provider==='klook').unavailable);
 });
 await t.test('Public setting and disclosure gate links; all disabled providers preserve Wallet state',async()=>{
  const keys=['affiliate_public_enabled','affiliate_disclosure_text'];const [saved]=await pool.query("SELECT * FROM app_settings WHERE setting_key IN ('affiliate_public_enabled','affiliate_disclosure_text')");
  try{
   const share=await ok('/trips/'+trip.id+'/share',user,{enabled:true,hideStay:true});const publicUrl='/shared/'+share.share_token+'/tickets/'+visits[1].id;
   for(const [key,value] of [['affiliate_public_enabled',false],['affiliate_disclosure_text','']]){
    const [[old]]=await pool.execute('SELECT version FROM app_settings WHERE setting_key=?',[key]);await ok('/admin/settings/'+key,superAdmin,{value,version:old?.version||0,reason:'Verify affiliate privacy policy gate',confirmation:'SAVE'});assert.equal((await call(publicUrl)).status,404);
   }
   assert.equal((await ok(base(1),user)).providers.length,0);
  }finally{for(const key of keys)await pool.execute('DELETE FROM app_settings WHERE setting_key=?',[key]);for(const row of saved)await pool.execute('INSERT INTO app_settings(setting_key,value,version,updated_by)VALUES(?,?,?,?)',[row.setting_key,JSON.stringify(row.value),row.version,row.updated_by]);}
  for(const p of (await ok('/admin/affiliates/providers',admin)).providers)await ok('/admin/affiliates/providers/'+p.id,superAdmin,{config:{...p.config,enabled:false},version:p.version,reason:'Disable all isolated provider fixtures',confirmation:'SAVE'},'PUT');
  const result=await ok(base(0),user);assert.equal(result.providers.length,0);assert(result.booking.saved);
 });
});
