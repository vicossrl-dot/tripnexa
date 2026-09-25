import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { access, unlink } from 'node:fs/promises';
import path from 'node:path';

test('MySQL Travel Wallet: multiple files, transactional edits, privacy, legacy files and cascading disk cleanup',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
  assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/);
  process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';process.env.SMTP_HOST='';
  const {pool}=await import('../db.js');const {migrate}=await import('../migrate.js');const {config}=await import('../config.js');const {hashPassword}=await import('../security.js');const {createApp}=await import('../app.js');
  await migrate();await migrate();
  const owners=[randomUUID(),randomUUID()],password='wallet test password 123';
  for(const id of owners)await pool.execute('INSERT INTO users (id,email,password_hash,email_verified) VALUES (?,?,?,TRUE)',[id,id+'@wallet.test',await hashPassword(password)]);
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const owner of owners){const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[owner]);await pool.execute('DELETE FROM users WHERE id=?',[owner]);for(const file of files)if(path.basename(file.filename)===file.filename)await unlink(path.join(config.uploads,file.filename)).catch(()=>{});}await pool.end();});
  const call=async(url,body,cookie,method=body?'POST':'GET')=>{const response=await fetch(origin+'/api'+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'TripSync',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const cookies=[];for(const id of owners)cookies.push((await call('/auth/login',{email:id+'@wallet.test',password})).cookie);
  const trip=(await call('/entities/Trip',{name:'Wallet test',destination:'Barcelona'},cookies[0])).data;
  const otherTrip=(await call('/entities/Trip',{name:'Other'},cookies[1])).data;
  const wallet=`/trips/${trip.id}/wallet`;
  const upload=async(name='ticket.pdf',cookie=cookies[0])=>{const form=new FormData();form.append('file',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),name);const response=await fetch(origin+'/api/uploads/wallet',{method:'POST',headers:{'X-Requested-With':'TripSync',Cookie:cookie},body:form});assert.equal(response.status,201);return response.json();};
  const files=[];for(let i=0;i<4;i++)files.push({...await upload(`ticket-${i}.pdf`),label:'Ticket '+i,traveler:'Family '+i});
  let response=await call(wallet+'/items',{item:{title:'Family flight',category:'flight',airline:'Example',traveler:'Family'},attachments:files},cookies[0]);assert.equal(response.status,201,JSON.stringify(response));let flight=response.data;assert.equal(flight.attachments.length,4);
  const [parents]=await pool.execute('SELECT id FROM trip_items WHERE trip_id=?',[trip.id]);assert.equal(parents.length,1);
  assert.equal((await call(wallet,null,cookies[0])).data.items[0].attachments.length,4);
  assert.equal((await call(wallet)).status,401);assert.equal((await call(wallet,null,cookies[1])).status,404);
  assert.equal((await call(`/trips/${otherTrip.id}/wallet/items`,{item:{title:'Stolen',category:'document'},attachments:[files[0]]},cookies[1])).status,404);
  assert.equal((await call(`/trips/${otherTrip.id}/wallet/items/${flight.id}`,{item:{title:'Intrusion'}},cookies[1],'PATCH')).status,404);
  const otherFile=await upload('foreign.pdf',cookies[1]);
  assert.equal((await call(wallet+'/items/'+flight.id,{item:{title:'Should roll back'},attachments:[otherFile]},cookies[0],'PATCH')).status,404);
  assert.equal((await call('/entities/TripItem/'+flight.id,null,cookies[0])).data.title,'Family flight');
  for(const invalid of [null,[],{id:12}])assert.equal((await call(wallet+'/items/'+flight.id,{item:{title:'Invalid edit must roll back'},attachments:[invalid]},cookies[0],'PATCH')).status,400);
  assert.equal((await call('/entities/TripItem/'+flight.id,null,cookies[0])).data.title,'Family flight');
  const fifth=await upload('extra.pdf');
  response=await call(wallet+'/items/'+flight.id,{item:{title:'Family flight'},attachments:[fifth]},cookies[0],'PATCH');assert.equal(response.status,200);flight=response.data;assert.equal(flight.attachments.length,5);
  response=await call(wallet+'/items/'+flight.id,{item:{title:'Family flight'},attachments:[{...flight.attachments[0],label:'Adult 1',traveler:'Alex'}]},cookies[0],'PATCH');assert.equal(response.data.attachments.length,5);assert(response.data.attachments.some(file=>file.label==='Adult 1'));
  await t.test('Private files and metadata cannot be accessed with another session or share token',async()=>{
    for(const file of flight.attachments){assert.equal((await fetch(origin+file.file_url)).status,401);assert.equal((await fetch(origin+file.file_url,{headers:{Cookie:cookies[1]}})).status,404);const own=await fetch(origin+file.file_url+'?view=1',{headers:{Cookie:cookies[0]}});assert.equal(own.status,200);assert.match(own.headers.get('content-disposition'),/^inline/);assert.equal(own.headers.get('cache-control'),'private, no-store');assert.equal(own.headers.get('x-frame-options'),'SAMEORIGIN');}
    const shared=(await call(`/trips/${trip.id}/share`,{enabled:true,hideStay:true},cookies[0])).data;
    const publicData=JSON.stringify((await call('/shared/'+shared.share_token)).data);
    for(const value of ['attachments','uploads','Family','passport'])assert(!publicData.includes(value));
    assert.equal((await fetch(origin+flight.attachments[0].file_url+'?token='+shared.share_token)).status,401);
    assert.equal((await call('/ai/wallet-extraction',{trip_id:trip.id,file_url:files[0].file_url,category:'document'},cookies[0])).status,400);
    assert.equal((await call('/ai/wallet-extraction',{trip_id:trip.id,file_url:files[0].file_url,category:'flight'},cookies[1])).status,404);
    const result=await fetch(origin+'/api'+wallet+'/items',{method:'POST',headers:{Cookie:cookies[0],'Content-Type':'application/json'},body:JSON.stringify({item:{title:'CSRF',category:'document'}})});assert.equal(result.status,403);
  });
  await t.test('Removing one attachment retains other files and shared references; last removal deletes the physical file',async()=>{
    const sharedFile=flight.attachments[0];
    const second=(await call(wallet+'/items',{item:{title:'Shared booking file',category:'place'},attachments:[sharedFile]},cookies[0])).data;
    // Existing attachment IDs cannot be transplanted, so attach by upload URL instead.
    assert.equal(second.error,'Attachment not found.');
    const booking=(await call(wallet+'/items',{item:{title:'Shared booking file',category:'place'},attachments:[{file_url:sharedFile.file_url,original_name:'shared.pdf'}]},cookies[0])).data;
    const [disk]=await pool.execute('SELECT filename FROM uploads WHERE id=?',[sharedFile.file_url.split('/').pop()]);const diskPath=path.join(config.uploads,disk[0].filename);
    const removed=await call(wallet+'/items/'+flight.id,{item:{title:'Family flight'},remove_attachment_ids:[sharedFile.id]},cookies[0],'PATCH');assert.equal(removed.status,200);assert.equal(removed.data.attachments.length,4);await access(diskPath);
    assert.equal((await call('/entities/TripItem/'+booking.id,null,cookies[0],'DELETE')).status,200);await assert.rejects(access(diskPath));
    assert.equal((await fetch(origin+sharedFile.file_url,{headers:{Cookie:cookies[0]}})).status,404);
  });
  await t.test('Legacy document and hotel files stay visible without copying files or duplicate parents',async()=>{
    const legacy=await upload('legacy.pdf');const parent=(await call('/entities/TripItem',{title:'Legacy reservation',category:'stay',trip_id:trip.id,reservation_file_url:legacy.file_url},cookies[0])).data;
    const listed=(await call(wallet,null,cookies[0])).data.items.find(item=>item.id===parent.id);assert.equal(listed.attachments.length,1);assert.equal(listed.attachments[0].id,'legacy:reservation_file_url');
    const saved=await call(wallet+'/items/'+parent.id,{item:{title:parent.title},attachments:[{...listed.attachments[0],label:'Old booking',traveler:'Sam'}]},cookies[0],'PATCH');assert.equal(saved.status,200);assert.equal(saved.data.attachments.length,1);
    await call(wallet+'/items/'+parent.id,{item:{title:parent.title},remove_attachment_ids:[saved.data.attachments[0].id]},cookies[0],'PATCH');
    assert.equal((await call('/entities/TripItem/'+parent.id,null,cookies[0])).data.reservation_file_url,null);
    assert.equal((await fetch(origin+legacy.file_url,{headers:{Cookie:cookies[0]}})).status,404);
  });
  const retained=(await call(wallet,null,cookies[0])).data.items.flatMap(item=>item.attachments);
  const [diskFiles]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=? AND id IN (SELECT upload_id FROM item_attachments)',[owners[0]]);
  assert.equal((await call('/entities/Trip/'+trip.id,null,cookies[0],'DELETE')).status,200);
  for(const file of retained)assert.equal((await fetch(origin+file.file_url,{headers:{Cookie:cookies[0]}})).status,404);
  for(const file of diskFiles)await assert.rejects(access(path.join(config.uploads,file.filename)));
  // Large deleted trips must not leave files beyond the cleanup batch limit.
  const {cleanupWalletFiles}=await import('../file-lifecycle.js');
  const staged=Array.from({length:501},()=>randomUUID());
  await pool.query('INSERT INTO uploads (id,owner_id,filename,mime,wallet_managed) VALUES ?',[staged.map(id=>[id,owners[0],id+'.pdf','application/pdf',true])]);
  await cleanupWalletFiles(staged);
  const [remaining]=await pool.execute(`SELECT COUNT(*) AS n FROM uploads WHERE id IN (${staged.map(()=>'?').join(',')})`,staged);assert.equal(remaining[0].n,0);
});
