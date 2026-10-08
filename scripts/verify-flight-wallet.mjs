// Real Chrome + HTTP + MySQL; synthetic Bunny transport, never production storage.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {openBrowser} from './browser-driver.mjs';
assert(/_test$/.test(process.env.MYSQL_TEST_DATABASE||''),'An isolated _test database is required.');
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';
const {pool}=await import('../server/db.js'),{migrate}=await import('../server/migrate.js'),{createApp}=await import('../server/app.js'),{hashPassword}=await import('../server/security.js');
await migrate();
const settingKeys=['storage_provider','bunny_storage_zone','bunny_storage_region','billing_enforcement_enabled'];
const [prior]=await pool.query('SELECT * FROM app_settings WHERE setting_key IN (?)',[settingKeys]);
const [secrets]=await pool.query("SELECT * FROM managed_secrets WHERE secret_name='BUNNY_STORAGE_PASSWORD'");
const oldPassword=process.env.BUNNY_STORAGE_PASSWORD;
const owner=randomUUID(),password=randomUUID()+'Test!',email=owner+'@flight-wallet.test';
const objects=new Map(),puts=[],originalFetch=globalThis.fetch;
const output=path.resolve('.local/flight-wallet');await mkdir(output,{recursive:true});
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
const filePath=path.join(output,'flight.png');await writeFile(filePath,bytes);
const checks=[];let browser,server;
try{
 await pool.query("DELETE FROM managed_secrets WHERE secret_name='BUNNY_STORAGE_PASSWORD'");process.env.BUNNY_STORAGE_PASSWORD='synthetic-password';
 for(const [key,value] of Object.entries({storage_provider:'bunny',bunny_storage_zone:'flight-fixture',bunny_storage_region:'DE',billing_enforcement_enabled:false}))await pool.execute('INSERT INTO app_settings(setting_key,value,version)VALUES(?,?,1) ON DUPLICATE KEY UPDATE value=VALUES(value)',[key,JSON.stringify(value)]);
 globalThis.fetch=async(url,options={})=>{
  if(!String(url).startsWith('https://storage.bunnycdn.com/flight-fixture/'))return originalFetch(url,options);
  const key=new URL(url).pathname;
  if(options.method==='PUT'){puts.push(key);objects.set(key,Buffer.from(options.body));return new Response(null,{status:201});}
  if(options.method==='DELETE'){objects.delete(key);return new Response(null,{status:200});}
  return objects.has(key)?new Response(options.method==='HEAD'?null:objects.get(key),{headers:{'Content-Length':String(objects.get(key).length)}}):new Response(null,{status:404});
 };
 await pool.execute('INSERT INTO users(id,email,password_hash,email_verified)VALUES(?,?,?,TRUE)',[owner,email,await hashPassword(password)]);
 server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;process.env.PUBLIC_APP_URL=origin;
 browser=await openBrowser(output);const {command,evaluate,wait,text,input,click,screenshot}=browser;
 const go=async(route,label)=>{await command('Page.navigate',{url:origin+route});await text(label);};
 const api=async(route,body)=>evaluate(`fetch(${JSON.stringify('/api'+route)},{method:${JSON.stringify(body?'POST':'GET')},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);
 await go('/login','Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');
 const created=await api('/entities/Trip',{name:'Flight attachment regression',destination:'Rome'});assert.equal(created.status,201);const tripId=created.data.id,base='/trips/'+tripId+'/wallet';
 for(const [category,label] of [['flight','Flights'],['place','Tickets'],['document','Documents']]){
  await go('/trip/'+tripId+'/wallet?category='+category,'Travel Wallet');await click('Add to Trip');await wait("!!document.querySelector('input[aria-label=\"Upload travel files\"]')");
  const doc=await command('DOM.getDocument'),node=await command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[aria-label="Upload travel files"]'});
  await command('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[filePath]});await wait("!!document.querySelector('[data-wallet-attachment]') && ![...document.querySelectorAll('button')].find(e=>e.textContent==='Save travel item')?.disabled");
  assert.equal((await api(base)).data.items.filter(item=>item.category===category).length,0,'Upload alone must not fabricate a booking');
  await text('uploaded file is ready');
  if(category==='flight'){
   let prompted=false;
   browser.onEvent('Page.javascriptDialogOpening',async()=>{prompted=true;await command('Page.handleJavaScriptDialog',{accept:false});});
   await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
   await new Promise(resolve=>setTimeout(resolve,300));assert(prompted,'Closing a staged upload must warn');assert(await evaluate("!!document.querySelector('[data-wallet-attachment]')"));
  }
  await click('Save travel item');await wait("!document.querySelector('[role=dialog]')");await text(label+' (1)');
  const item=(await api(base)).data.items.find(item=>item.category===category);assert.equal(item.attachments.length,1);const id=item.attachments[0].file_url.split('/').at(-1);
  const [[row]]=await pool.execute('SELECT u.*,i.category,i.trip_id,a.owner_id AS attachment_owner FROM uploads u JOIN item_attachments a ON a.upload_id=u.id JOIN trip_items i ON i.id=a.item_id WHERE u.id=?',[id]);
  assert.equal(row.owner_id,owner);assert.equal(row.attachment_owner,owner);assert.equal(row.trip_id,tripId);assert.equal(row.category,category);assert.equal(row.storage_provider,'bunny');assert.equal(row.asset_kind,'wallet');assert.equal(row.wallet_managed,1);
  assert.deepEqual(objects.get('/flight-fixture/'+row.storage_key),bytes);
  await click('View');await wait("!!document.querySelector('[data-wallet-item-detail]')");
  await click('View file');
  await wait("document.querySelector('[data-wallet-viewer] img')?.naturalWidth>0");await screenshot(category+'-file');await click('Close file');
  await go('/trip/'+tripId+'/wallet?category='+category,'Travel Wallet');await text(label+' (1)');
  checks.push(category+': real image upload, Bunny adapter PUT, database association, Wallet count, private viewer and reload passed');
 }
 assert.equal(puts.length,3);assert.equal(new Set(puts).size,3);
 const [[totals]]=await pool.execute('SELECT COUNT(*) AS n FROM trip_items WHERE owner_id=?',[owner]);assert.equal(totals.n,3);assert.deepEqual(browser.exceptions,[]);
 await browser.screenshot('wallet');console.log(JSON.stringify({mode:'Synthetic Bunny transport; real Chrome/HTTP/MySQL and image file',checks},null,2));
}finally{
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;
 await pool.execute('DELETE FROM users WHERE id=?',[owner]);
 await pool.query('DELETE FROM app_settings WHERE setting_key IN (?)',[settingKeys]);for(const row of prior)await pool.execute('INSERT INTO app_settings(setting_key,value,version,updated_by,updated_at)VALUES(?,?,?,?,?)',[row.setting_key,typeof row.value==='string'?row.value:JSON.stringify(row.value),row.version,row.updated_by,row.updated_at]);
 for(const row of secrets)await pool.execute('INSERT INTO managed_secrets(secret_name,provider,encrypted_value,version,updated_by,updated_at)VALUES(?,?,?,?,?,?)',[row.secret_name,row.provider,typeof row.encrypted_value==='string'?row.encrypted_value:JSON.stringify(row.encrypted_value),row.version,row.updated_by,row.updated_at]);
 if(oldPassword===undefined)delete process.env.BUNNY_STORAGE_PASSWORD;else process.env.BUNNY_STORAGE_PASSWORD=oldPassword;await pool.end();
}
