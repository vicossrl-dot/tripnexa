import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('Storage HTTP integration: encrypted settings, provider selection, private reads and cleanup',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
  assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/);process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';
  const oldMaster=process.env.ADMIN_SECRETS_MASTER_KEY;process.env.ADMIN_SECRETS_MASTER_KEY=randomBytes(32).toString('hex');
  const {pool}=await import('../db.js'),{migrate}=await import('../migrate.js'),{createApp}=await import('../app.js'),{hashPassword}=await import('../security.js'),{deleteStoredFile}=await import('../storage/index.js');await migrate();
  const [prior]=await pool.query("SELECT * FROM app_settings WHERE setting_key LIKE 'bunny_%' OR setting_key='storage_provider' OR setting_key='billing_enforcement_enabled'");
  const [priorSecrets]=await pool.query("SELECT * FROM managed_secrets WHERE secret_name='BUNNY_STORAGE_PASSWORD'");
  const setting=async(key,value)=>pool.execute('INSERT INTO app_settings(setting_key,value,version)VALUES(?,?,1) ON DUPLICATE KEY UPDATE value=VALUES(value)',[key,JSON.stringify(value)]);
  await setting('billing_enforcement_enabled',false);await setting('storage_provider','local');await setting('bunny_storage_zone','fixture-private-zone');await setting('bunny_storage_region','DE');
  const users=[],password=randomUUID()+'Test!',objects=new Map(),requests=[],originalFetch=globalThis.fetch;let failed=false,changeZoneOnUpload=false;
  globalThis.fetch=async(url,options={})=>{
    if(!String(url).startsWith('https://storage.bunnycdn.com/'))return originalFetch(url,options);
    requests.push({method:options.method,url:String(url)});assert.equal(options.headers.AccessKey,'synthetic-storage-password');
    if(failed)return new Response('SECRET PROVIDER BODY',{status:503});
    const key=new URL(url).pathname;
    if(options.method==='PUT'){if(changeZoneOnUpload){changeZoneOnUpload=false;await setting('bunny_storage_zone','changed-during-upload');}objects.set(key,Buffer.from(options.body));return new Response(null,{status:201});}
    if(options.method==='DELETE'){objects.delete(key);return new Response(null,{status:200});}
    if(!objects.has(key))return new Response(null,{status:404});
    return new Response(options.method==='HEAD'?null:objects.get(key),{headers:{'content-length':String(objects.get(key).length)}});
  };
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const root='http://127.0.0.1:'+server.address().port;process.env.PUBLIC_APP_URL=root;
  const call=async(path,cookie='',body=null,method=body?'POST':'GET')=>{const r=await fetch(root+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-Requested-With':'TripSync'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
  const user=async role=>{const id=randomUUID();users.push(id);const email=id+'@storage.test';await pool.execute('INSERT INTO users(id,email,password_hash,email_verified,role)VALUES(?,?,?,TRUE,?)',[id,email,await hashPassword(password),role]);const result=await call('/auth/login','',{email,password});if(role!=='USER')await pool.execute('UPDATE sessions SET mfa_verified_at=UTC_TIMESTAMP(3) WHERE user_id=?',[id]);return {id,cookie:result.cookie};};
  t.after(async()=>{
    failed=false;
    for(const id of users){const [files]=await pool.execute('SELECT * FROM uploads WHERE owner_id=?',[id]);for(const file of files)await deleteStoredFile(file);await pool.execute('DELETE FROM users WHERE id=?',[id]);}
    await pool.query("DELETE FROM managed_secrets WHERE secret_name='BUNNY_STORAGE_PASSWORD'");for(const row of priorSecrets)await pool.execute('INSERT INTO managed_secrets(secret_name,provider,encrypted_value,version,updated_by,updated_at)VALUES(?,?,?,?,?,?)',[row.secret_name,row.provider,typeof row.encrypted_value==='string'?row.encrypted_value:JSON.stringify(row.encrypted_value),row.version,row.updated_by,row.updated_at]);
    await pool.query("DELETE FROM app_settings WHERE setting_key LIKE 'bunny_%' OR setting_key='storage_provider' OR setting_key='billing_enforcement_enabled'");for(const row of prior)await pool.execute('INSERT INTO app_settings(setting_key,value,version,updated_by,updated_at)VALUES(?,?,?,?,?)',[row.setting_key,typeof row.value==='string'?row.value:JSON.stringify(row.value),row.version,row.updated_by,row.updated_at]);
    globalThis.fetch=originalFetch;if(oldMaster===undefined)delete process.env.ADMIN_SECRETS_MASTER_KEY;else process.env.ADMIN_SECRETS_MASTER_KEY=oldMaster;await new Promise(resolve=>server.close(resolve));await pool.end();
  });
  const a=await user('USER'),b=await user('USER'),admin=await user('SUPER_ADMIN');
  assert.equal((await call('/admin/bunny',a.cookie)).status,403);
  const secretVersion=priorSecrets[0]?.version||0;
  assert.equal((await call('/admin/secrets/BUNNY_STORAGE_PASSWORD',admin.cookie,{value:'synthetic-storage-password',version:secretVersion,test:false,reason:'Synthetic storage test',confirmation:'REPLACE'})).status,200);
  const secrets=await call('/admin/secrets',admin.cookie);assert(!JSON.stringify(secrets).includes('synthetic-storage-password'));assert(secrets.data.items.find(item=>item.name==='BUNNY_STORAGE_PASSWORD').configured);
  const checked=await call('/admin/bunny/test',admin.cookie,{reason:'Verify temporary synthetic object',confirmation:'TEST'});assert.equal(checked.data.ok,true);assert.equal(objects.size,0);
  const upload=async()=>{const data=new FormData();data.append('file',new Blob(['%PDF-1.4\n%%EOF'],{type:'application/pdf'}),'private.pdf');const r=await fetch(root+'/api/uploads/wallet',{method:'POST',headers:{Cookie:a.cookie,'X-Requested-With':'TripSync'},body:data});return {status:r.status,data:await r.json()};};
  const local=await upload();assert.equal(local.status,201);await setting('storage_provider','bunny');
  const dryRun=await promisify(execFile)(process.execPath,['scripts/migrate-bunny-storage.mjs','--dry-run'],{env:process.env,windowsHide:true});
  const migration=JSON.parse(dryRun.stdout);assert(migration.filesFound>=1);assert.equal(migration.filesMigrated,0);assert.equal(migration.databaseRecordsUpdated,0);assert(migration.objects.some(object=>object.id===local.data.file_url.split('/').pop()&&object.status==='would-copy'));
  changeZoneOnUpload=true;assert.equal((await upload()).status,409);assert.equal(objects.size,0);await setting('bunny_storage_zone','fixture-private-zone');
  const remote=await upload();assert.equal(remote.status,201);assert(!JSON.stringify(remote).includes('fixture-private-zone'));assert.equal(objects.size,1);
  for(const file of [local,remote]){
    const before=requests.length;
    assert.equal((await fetch(root+file.data.file_url)).status,401);
    assert.equal((await fetch(root+file.data.file_url,{headers:{Cookie:b.cookie}})).status,404);
    assert.equal(requests.length,before,'Unauthorized requests must not read provider bytes');
    const own=await fetch(root+file.data.file_url,{headers:{Cookie:a.cookie}});assert.equal(own.status,200);assert.equal(own.headers.get('cache-control'),'private, no-store');assert.equal(await own.text(),'%PDF-1.4\n%%EOF');
  }
  const otherTrip=(await call('/entities/Trip',b.cookie,{name:'Other owner'})).data;
  assert.equal((await call('/trips/'+otherTrip.id+'/wallet/items',b.cookie,{item:{title:'Forbidden',category:'document'},attachments:[remote.data]})).status,404);
  const [[record]]=await pool.execute('SELECT * FROM uploads WHERE id=?',[remote.data.file_url.split('/').pop()]);assert.equal(record.storage_provider,'bunny');assert.match(record.checksum_sha256,/^[a-f0-9]{64}$/);
  const reviewer=await user('SUPER_ADMIN');
  const grant=await call('/admin/file-grants',admin.cookie,{file_id:record.id,reason:'Synthetic private file review',confirmation:'REQUEST'});assert.equal(grant.status,200);
  assert.equal((await call('/admin/file-grants/'+grant.data.id+'/approve',admin.cookie,{reason:'Self approval must fail',confirmation:'APPROVE'})).status,403);
  assert.equal((await call('/admin/file-grants/'+grant.data.id+'/approve',reviewer.cookie,{reason:'Independent synthetic review',confirmation:'APPROVE'})).status,200);
  assert.equal((await fetch(root+'/api/admin/file-grants/'+grant.data.id+'/content',{headers:{Cookie:admin.cookie}})).status,200);
  await call('/admin/file-grants/'+grant.data.id+'/revoke',reviewer.cookie,{reason:'Finish synthetic review',confirmation:'REVOKE'});
  assert.equal((await fetch(root+'/api/admin/file-grants/'+grant.data.id+'/content',{headers:{Cookie:admin.cookie}})).status,403);
  assert.equal((await call('/admin/settings/bunny_storage_zone',admin.cookie,{value:'../unsafe',version:1,reason:'Reject invalid zone',confirmation:'SAVE'})).status,400);
  const generatedTrip=(await call('/entities/Trip',a.cookie,{name:'Generated cover test'})).data;
  const {saveImage}=await import('../uploads.js');
  const generated=await saveImage(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),a.id,generatedTrip.id,true);
  const [[generatedRow]]=await pool.execute('SELECT * FROM uploads WHERE id=?',[generated.file_url.split('/').pop()]);
  assert.equal(generatedRow.asset_kind,'generated');assert.equal(generatedRow.storage_provider,'bunny');assert(generatedRow.storage_key.includes('/trips/'+generatedTrip.id+'/generated/'));assert.equal(generatedRow.wallet_managed,0);
  await deleteStoredFile(generatedRow);await pool.execute('DELETE FROM uploads WHERE id=?',[generatedRow.id]);
  await setting('storage_provider','local');assert.equal((await fetch(root+remote.data.file_url,{headers:{Cookie:a.cookie}})).status,200);
  const master=process.env.ADMIN_SECRETS_MASTER_KEY;delete process.env.ADMIN_SECRETS_MASTER_KEY;
  try{assert.equal((await upload()).status,201);assert.equal((await call('/admin/bunny',admin.cookie)).status,200);}finally{process.env.ADMIN_SECRETS_MASTER_KEY=master;}
  const changed=await call('/admin/settings/bunny_storage_zone',admin.cookie,{value:'another-zone',version:1,reason:'Attempt to strand stored file',confirmation:'SAVE'});assert.equal(changed.status,409);
  failed=true;const unavailable=await fetch(root+remote.data.file_url,{headers:{Cookie:a.cookie}});assert.equal(unavailable.status,502);assert(!(await unavailable.text()).includes('SECRET PROVIDER BODY'));failed=false;
  await deleteStoredFile(record);await pool.execute('DELETE FROM uploads WHERE id=?',[record.id]);assert.equal((await fetch(root+remote.data.file_url,{headers:{Cookie:a.cookie}})).status,404);assert.equal(objects.size,0);
});
