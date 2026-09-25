// Isolated browser fixtures, not real affiliate attribution. Never purchases or visits provider checkout.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import QRCode from 'qrcode';
import {openBrowser} from './browser-driver.mjs';
assert(/_test$/.test(process.env.MYSQL_TEST_DATABASE||''),'Use MYSQL_TEST_DATABASE ending in _test.');
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';
const {pool}=await import('../server/db.js'),{migrate}=await import('../server/migrate.js'),{config}=await import('../server/config.js'),{createApp}=await import('../server/app.js'),{hashPassword}=await import('../server/security.js'),{definitions}=await import('../server/affiliate-providers/index.js');
await migrate();config.googleMapsKey='';config.aiKey='';
const output=path.resolve('.local/affiliate-verification');await mkdir(output,{recursive:true});
const [prior]=await pool.query('SELECT * FROM affiliate_providers');const owner=randomUUID(),admin=randomUUID(),password=randomUUID()+'Strong!',email=owner+'@affiliate-browser.test',placeId='affiliate-browser-'+randomUUID();
const report={mode:'isolated local fixtures; no real affiliate accounts',checks:[],failures:[]};
const pass=name=>{report.checks.push(name);console.log('PASS',name);};
const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;config.appUrl=origin;process.env.PUBLIC_APP_URL=config.appUrl;
let browser,trip;
try{
 for(const [id,role] of [[owner,'USER'],[admin,'SUPER_ADMIN']])await pool.execute('INSERT INTO users(id,email,password_hash,email_verified,role)VALUES(?,?,?,TRUE,?)',[id,id+'@affiliate-browser.test',await hashPassword(password),role]);
 for(const [i,p] of definitions.entries()){
  const cfg={enabled:true,display_name:p.name,order:i+1,partner_id:'TEST_ONLY',language:'en',currency:'EUR',search_template:'',allowed_hosts:p.hosts,cache_ttl:300,fallback:'none'};
  await pool.execute('INSERT INTO affiliate_providers(provider,config)VALUES(?,?) ON DUPLICATE KEY UPDATE config=VALUES(config)',[p.id,JSON.stringify(cfg)]);
  const tracking=p.id==='getyourguide'?'partner_id=TEST_ONLY':p.id==='viator'?'pid=PTEST&mcid=123&medium=link':'affiliate_fixture=TEST_ONLY';
  await pool.execute('INSERT INTO affiliate_place_mappings(id,provider,google_place_id,canonical_place_name,city,country,affiliate_url,created_by)VALUES(?,?,?,?,?,?,?,?)',[randomUUID(),p.id,placeId,'Sagrada Familia','Barcelona','Spain','https://www.'+p.root+'/fixture-attraction?'+tracking,admin]);
 }
 browser=await openBrowser(output);const {evaluate,command,click,input,text,wait,screenshot}=browser;
 const go=async(url,expected)=>{await command('Page.navigate',{url:origin+url});if(expected)await text(expected);};
 const api=async(route,body,method=body?'POST':'GET')=>{const r=await evaluate(`fetch(${JSON.stringify('/api'+route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(r.status<400,JSON.stringify(r));return r.data;};
 await browser.viewport(1440);await go('/login','Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');
 trip=await api('/entities/Trip',{name:'Barcelona · Tickets & Tours',destination:'Barcelona',country:'Spain',adults:1,start_date:'2026-10-05',end_date:'2026-10-06'});
 await api('/entities/PlaceSelection',{trip_id:trip.id,name:'Sagrada Familia',place_id:placeId,city:'Barcelona',country:'Spain',category:'tourist_attraction',priority:'mandatory',lat:41.4036,lng:2.1744,address:'Carrer de Mallorca, Barcelona',desired_duration_min:60});
 await api('/entities/PlaceSelection',{trip_id:trip.id,name:'Generic free public park',place_id:placeId+'-park',city:'Barcelona',country:'Spain',category:'park',priority:'mandatory',lat:41.401,lng:2.171,address:'Barcelona',desired_duration_min:30});
 await api('/trips/'+trip.id+'/itinerary',{use_ai:false});
 await go('/trip/'+trip.id+'/itinerary','Tickets & tours');await wait("document.querySelectorAll('[data-ticket-actions]').length===1");pass('Ticket CTA on attraction; generic free park has none');
 await click('Tickets & tours');await wait("document.querySelectorAll('[role=dialog] a[rel*=sponsored]').length===4");await screenshot('desktop-provider-modal');
 const links=await evaluate("[...document.querySelectorAll('[role=dialog] a[rel*=sponsored]')].map(a=>({href:a.href,target:a.target,rel:a.rel,label:a.getAttribute('aria-label')}))");assert(links.every(a=>a.target==='_blank'&&a.rel==='sponsored noopener noreferrer'&&a.label.includes('new tab')));assert(links[0].href.includes('partner_id=TEST_ONLY'));assert(links[1].href.includes('pid=PTEST&mcid=123&medium=link'));pass('Four ordered provider links retain fixture tracking and secure new-tab attributes');
 for(let i=0;i<16;i++){await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert(await evaluate("!!document.activeElement.closest('[role=dialog]')"));}pass('Keyboard focus stays in the modal');
 await browser.viewport(390,844);await screenshot('mobile-provider-modal');assert(await evaluate("document.documentElement.scrollWidth<=innerWidth+2&&document.querySelector('[role=dialog]').scrollWidth<=document.querySelector('[role=dialog]').clientWidth+2"));pass('Mobile modal fits screen without horizontal overflow');
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});await wait("!document.querySelector('[role=dialog]')");await wait("document.activeElement.textContent==='Tickets & tours'");pass('Escape closes and returns focus to the trigger');
 await click('Tickets & tours');await click('Mark as booked');await text('Remove my booked mark');await click('Add your ticket to Travel Wallet');await text('Edit travel item');
 const qr=path.join(output,'synthetic-ticket.png');await QRCode.toFile(qr,'TRIPSYNC FIXTURE TICKET - NOT VALID FOR ENTRY',{width:900});
 const doc=await command('DOM.getDocument');const fileInput=await command('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});await command('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[qr]});await text('synthetic-ticket.png');await wait("[...document.querySelectorAll('button')].some(b=>b.textContent==='Save changes'&&!b.disabled)");await click('Save changes');await text('Ticket saved');await screenshot('mobile-ticket-saved');pass('Manual booked state, real file upload UI and immediate Ticket saved state');
 await go('/trip/'+trip.id+'/itinerary','Ticket saved');assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.textContent==='Tickets & tours').length"),0);await browser.viewport(1440);await screenshot('desktop-ticket-saved');
 await evaluate("[...document.querySelectorAll('a')].find(a=>a.textContent==='View ticket').click()");await text('View file');await click('View file');await wait("document.querySelector('[data-wallet-file-content] img')?.complete");await screenshot('wallet-private-ticket');pass('Reload preserves Ticket saved; View ticket opens the associated private Wallet file');
 const share=await api('/trips/'+trip.id+'/share',{enabled:true,hideStay:true});await api('/auth/logout',{});await go('/share/'+share.share_token,'Tickets & tours');await click('Tickets & tours');await wait("document.querySelectorAll('[role=dialog] a[rel*=sponsored]').length===4");assert(!await evaluate("document.querySelector('[role=dialog]').innerText.includes('Already booked?')"));await screenshot('public-provider-modal');pass('Anonymous modal offers safe providers without Wallet or booking metadata');
 await go('/login','Welcome back');await input('#email',admin+'@affiliate-browser.test');await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');await pool.execute('UPDATE sessions SET mfa_verified_at=UTC_TIMESTAMP(3) WHERE user_id=?',[admin]);
 await go('/admin/tours-tickets','Configure GetYourGuide');await screenshot('admin-providers');await click('Configure GetYourGuide');await text('Official search URL template');await screenshot('admin-provider-configuration');await click('Place mappings');await text('Sagrada Familia');await screenshot('admin-mappings');await click('Add exact mapping');await text('Find an attraction with Google Maps');await screenshot('admin-new-mapping');await click('Cancel');await click('Affiliate analytics');await text('Sales: N/A');await screenshot('admin-analytics');pass('Admin provider configuration, exact mappings and truthful N/A analytics');
 assert.equal(browser.exceptions.length,0);pass('No unhandled browser exceptions');
}catch(error){report.failures.push(error.message);console.error(error.message);await browser?.screenshot('failure').catch(()=>{});process.exitCode=1;}
finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));await pool.execute('DELETE FROM affiliate_place_mappings WHERE created_by=?',[admin]);await pool.query('DELETE FROM affiliate_providers');for(const p of prior)await pool.execute('INSERT INTO affiliate_providers(provider,config,version,last_check,checked_at,updated_by)VALUES(?,?,?,?,?,?)',[p.provider,typeof p.config==='string'?p.config:JSON.stringify(p.config),p.version,p.last_check?typeof p.last_check==='string'?p.last_check:JSON.stringify(p.last_check):null,p.checked_at,p.updated_by]);
 for(const id of [owner,admin]){const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[id]);if(trip)await pool.execute('DELETE FROM affiliate_click_events WHERE trip_id=?',[trip.id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);await pool.execute('DELETE FROM audit_events WHERE actor_user_id=?',[id]);for(const f of files)if(path.basename(f.filename)===f.filename)await unlink(path.join(config.uploads,f.filename)).catch(()=>{});}
 await pool.end();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
