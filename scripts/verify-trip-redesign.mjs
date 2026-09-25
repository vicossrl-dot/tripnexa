// Real local app, disposable five-day fixture; no provider calls or changes to existing user trips.
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pool} from '../server/db.js';
import {config} from '../server/config.js';
import {hashPassword} from '../server/security.js';
import {browserDriver} from './browser-driver.mjs';
const directory=path.resolve('.local/trip-redesign');await mkdir(directory,{recursive:true});
const root='http://127.0.0.1:5173',owner=randomUUID(),password=randomUUID()+'Test!',email=owner+'@redesign.test';
const report={date:new Date().toISOString(),checks:[]};let browser;
const pass=name=>{report.checks.push(name);console.log('PASS:',name);};
try {
 await pool.execute('INSERT INTO users (id,email,password_hash,email_verified,display_name) VALUES (?,?,?,TRUE,?)',[owner,email,await hashPassword(password),'Redesign Test']);
 browser=await browserDriver(directory);const {evaluate,wait,text,input,click,command}=browser;
 await browser.navigate(root+'/login');await text('Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('New Trip');
 const api=async(url,body,method=body?'POST':'GET')=>{const result=await evaluate(`fetch(${JSON.stringify('/api'+url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(result.status<400,JSON.stringify(result));return result.data;};
 const trip=await api('/entities/Trip',{name:'Five days in Barcelona',destination:'Barcelona',destination_city:'Barcelona',country:'Spain',timezone:'Europe/Madrid',start_date:'2026-10-01',end_date:'2026-10-05',travel_type:'plane',adults:2,children_ages:'7,10',arrival_location:'BCN',arrival_datetime:'2026-10-01T10:35',departure_location:'BCN',departure_datetime:'2026-10-05T18:00',stay_status:'booked'});
 const hotel=await api('/entities/TripItem',{trip_id:trip.id,category:'stay',title:'Garden House Barcelona',address:'Carrer de Mallorca, Barcelona',date:'2026-10-01',end_date:'2026-10-05',check_in_time:'15:00',check_out_time:'11:00'});
 const ticket=await api('/entities/TripItem',{trip_id:trip.id,category:'place',title:'Sagrada Familia',address:'Carrer de Mallorca 401, Barcelona',date:'2026-10-02',time:'11:00'});
 await api('/trips/'+trip.id+'/planning/places',{items:[{id:randomUUID(),trip_id:trip.id,trip_item_id:ticket.id,name:'Sagrada Familia',address:ticket.address,priority:'mandatory',desired_duration_min:90,fixed_date:'2026-10-02',selection_source:'manual',ticket_type:'entry',ticket_purchased:true},{id:randomUUID(),trip_id:trip.id,name:'Park Guell',address:'Gracia, Barcelona',priority:'preferred',selection_source:'ai',desired_duration_min:60,fixed_date:'2026-10-03'}]},'PUT');
 await api('/trips/'+trip.id+'/itinerary',{use_ai:false});
 // Reuse the synthetic boarding pass rendered by the wallet test; upload through the same authenticated API.
 const file=await evaluate(`(async()=>{const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=600;const x=canvas.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1000,600);x.fillStyle='black';x.font='30px Arial';x.fillText('TEST ONLY - Sagrada Familia',60,70);for(let i=0;i<90;i++)if(i%3!==0)x.fillRect(60+i*9,160,(i%2+1)*3,280);const blob=await new Promise(resolve=>canvas.toBlob(resolve));const form=new FormData();form.append('file',blob,'synthetic-ticket.png');return fetch('/api/uploads/wallet',{method:'POST',headers:{'X-Requested-With':'TripSync'},body:form}).then(r=>r.json());})()`);
 await api('/trips/'+trip.id+'/wallet/items/'+ticket.id,{item:{title:ticket.title},attachments:[{file_url:file.file_url,original_name:'synthetic-ticket.png',traveler:'Alex',label:'Family entry'}]},'PATCH');
 const legacy=await api('/entities/TripItem',{trip_id:trip.id,category:'document',title:'Legacy image',image_url:file.file_url});
 const incomplete=await api('/entities/TripItem',{trip_id:trip.id,category:'flight',title:'Family flight',departure_airport:'RMO',arrival_airport:'BCN',arrival_datetime:'2026-10-01T10:35'});
 await api('/trips/'+trip.id+'/wallet/items/'+incomplete.id,{item:{title:incomplete.title},attachments:[{file_url:file.file_url,original_name:'boarding-pass.png',traveler:'Alex'}]},'PATCH');
 const base='/trip/'+trip.id;
 const snapshot=async()=>{const result={};for(const table of ['trips','trip_items','itinerary_items','place_selections','day_windows']){const [rows]=await pool.execute(`SELECT * FROM ${table} WHERE owner_id=? ORDER BY id`,[owner]);result[table]=rows;}const [attachments]=await pool.execute('SELECT * FROM item_attachments WHERE owner_id=? ORDER BY id',[owner]);result.attachments=attachments;return JSON.stringify(result);};
 const before=await snapshot();
 for(const [width,height,label] of [[2560,1440,'wide'],[1366,1000,'laptop'],[390,844,'mobile']]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  for(const [suffix,ready,name] of [['','Trip at a glance','overview'],['/plan?step=5','Regenerate itinerary','planner'],['/itinerary','All days','itinerary'],['/wallet','Flights (1)','wallet']]){
   await browser.navigate(root+base+suffix);await text(ready);await browser.pause(300);
   assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),label+' '+name+' has horizontal overflow');
   assert(!await evaluate("document.body.innerText.includes('Private tickets & reservations')"));
   if(name==='overview'){
    assert.equal(await evaluate("document.querySelectorAll('[data-day-preview]').length"),5);
    assert.equal(await evaluate("document.querySelector('[data-summary-count=flight]').textContent"),'1');
    assert.equal(await evaluate("document.querySelector('[data-summary-count=place]').textContent"),'1');
    assert.equal(await evaluate("document.querySelector('[data-summary-count=document]').textContent"),'1');
    assert(!await evaluate("[...document.querySelectorAll('a')].some(a=>a.getAttribute('href')?.startsWith('/api/uploads/'))"));
    assert(!await evaluate("document.querySelector('[data-semantic-shortcuts]').innerText.includes('.png')"));
   }
   if(name==='itinerary'){
    assert.equal(await evaluate("document.querySelectorAll('[data-itinerary-day]').length"),5);
    await evaluate("document.querySelectorAll('[data-day-select]')[3].click()");await wait("document.querySelectorAll('[data-itinerary-day]').length===1");
    assert.equal(await evaluate("document.querySelector('[data-itinerary-day]').dataset.itineraryDay"),'2026-10-04');
    await click('All days');await wait("document.querySelectorAll('[data-itinerary-day]').length===5");
    assert(await evaluate("!!document.querySelector('a[href*=google]')"));
   }
   await browser.screenshot(label+'-'+name);
  }
  pass(label+': four screens fit viewport; five days, counts and day navigation correct');
 }
 assert.equal(await snapshot(),before,'Viewing must not mutate stored trip, planning, itinerary or attachment records');pass('Opening/refreshing all four pages and selecting days performs no data mutations');
 await browser.navigate(root+base+'/plan?step=0');await text('Destination & time');
 for(let i=0;i<6;i++){await evaluate(`document.querySelector('[data-plan-step="${i}"]').click()`);await text('Step '+(i+1)+' of 6');await wait("!document.body.innerText.includes('Saving…')");if([0,2,3].includes(i)){assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await browser.screenshot('mobile-planner-step-'+i);}}
 pass('All six planning steps accessible; saved state retained');
 await browser.navigate(root+base+'/wallet?category=document');await text('Legacy image');await click('View','[data-wallet-item] button');await text('1 attached file');await click('View file','[data-wallet-file] button');await wait("document.querySelector('[data-wallet-viewer] img')?.naturalWidth>0");await browser.screenshot('mobile-legacy-file');await click('Close file');
 await browser.navigate(root+base+'/wallet?category=flight');await text('Flights (1)');await click('Add to Trip');await wait("!!document.querySelector('[role=dialog]')");await browser.screenshot('mobile-add-modal');
 const modal=await evaluate("(()=>{const d=document.querySelector('[role=dialog]'),r=d.getBoundingClientRect(),f=d.querySelector('footer').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,footer:f.bottom};})()");assert(modal.top>=0&&modal.bottom<=modal.height+1&&modal.footer<=modal.height);await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await browser.navigate(root+base);await text('Trip at a glance');await evaluate("document.querySelector('[data-day-preview=\"2026-10-03\"]').click()");await wait("document.querySelector('[data-itinerary-day]')?.dataset.itineraryDay==='2026-10-03'");await evaluate('history.back()');await text('Trip at a glance');await evaluate('history.forward()');await wait("document.querySelectorAll('[data-itinerary-day]').length===1");await command('Page.reload');await wait("document.querySelector('[data-itinerary-day]')?.dataset.itineraryDay==='2026-10-03'");
 pass('Overview day links, browser Back/Forward and refresh retain selected day');
 assert.equal((await fetch(root+file.file_url)).status,401);await api('/trips/'+trip.id+'/share',{enabled:true,hideStay:true});
 const shared=await api('/entities/Trip/'+trip.id);const publicData=await(await fetch(root+'/api/shared/'+shared.share_token)).text();assert(!publicData.includes(file.file_url)&&!publicData.includes('Legacy image'));
 assert.deepEqual(browser.exceptions,[]);assert(!browser.requests.some(url=>/base44\.(com|app)/.test(url)));pass('Legacy private files, mobile viewer/modal, public privacy and JavaScript runtime checks passed');
 report.success=true;
}catch(error){console.error(error);report.success=false;report.error=error.message;process.exitCode=1;if(browser){console.error((await browser.evaluate('document.body.innerText').catch(()=>''))?.slice(-2500));await browser.screenshot('failure').catch(()=>{});}}
finally{await browser?.close();const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[owner]);await pool.execute('DELETE FROM users WHERE id=?',[owner]);for(const file of files)if(path.basename(file.filename)===file.filename)await unlink(path.join(config.uploads,file.filename)).catch(()=>{});await pool.end();await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
