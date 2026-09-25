// Real local app, MySQL and Chrome. A disposable account isolates all test data.
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pool} from '../server/db.js';
import {hashPassword} from '../server/security.js';
import {browserDriver} from './browser-driver.mjs';
const directory=path.resolve('.local/scheduling-verification');await mkdir(directory,{recursive:true});
const owner=randomUUID(),password=randomUUID()+'Test!',root='http://127.0.0.1:5173';
const report={date:new Date().toISOString(),checks:[]};let browser;
const pass=message=>{report.checks.push(message);console.log('PASS:',message);};
try {
 await pool.execute('INSERT INTO users (id,email,password_hash,email_verified,display_name) VALUES (?,?,?,TRUE,?)',[owner,owner+'@schedule.test',await hashPassword(password),'Scheduling verification']);
 browser=await browserDriver(directory);const {evaluate,text,input,click,wait,command}=browser;
 await browser.navigate(root+'/login');await text('Welcome back');await input('#email',owner+'@schedule.test');await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('New Trip');
 const api=async(url,body,method=body?'POST':'GET')=>{const result=await evaluate(`fetch(${JSON.stringify('/api'+url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(result.status<400,JSON.stringify(result));return result.data;};
 const trip=await api('/entities/Trip',{name:'Bucharest after dark',destination:'Bucharest',country:'Romania',timezone:'Europe/Bucharest',start_date:'2026-10-01',end_date:'2026-10-03',travel_type:'plane',adults:2,arrival_location:'Bucharest Henri Coanda Airport',arrival_datetime:'2026-10-01T22:22',arrival_lat:44.5711,arrival_lng:26.085,departure_location:'Bucharest Henri Coanda Airport',departure_datetime:'2026-10-03T20:00',departure_lat:44.5711,departure_lng:26.085,pace:'balanced',interests:'History,Nature',transport_preference:'taxi',buffer_min:15,meal_duration_min:60,stay_status:'booked'});
 await api('/entities/TripItem',{trip_id:trip.id,category:'stay',title:'Bucharest test stay',address:'Soseaua Panduri 14, Bucharest',date:trip.start_date,end_date:trip.end_date,lat:44.415,lng:26.04,check_in_time:'15:00',check_out_time:'11:00'});
 const dates=['2026-10-01','2026-10-02','2026-10-03'];await api(`/trips/${trip.id}/planning/windows`,{items:dates.map(date=>({id:randomUUID(),trip_id:trip.id,date,windows:'[{"start":"09:30","end":"18:30"}]',blocked:'[]',start_point:'Hotel',end_point:'Hotel'}))},'PUT');
 const desired=['Palace of Parliament','Romanian Athenaeum'].map(name=>({id:randomUUID(),trip_id:trip.id,name,priority:'mandatory',selection_source:'manual',desired_duration_min:60,address:name+', Bucharest',lat:44.43,lng:26.09,status:'resolved'}));
 const optional=['Stavropoleos Monastery','Revolution Square','AFI Cotroceni','Old Town Bucharest','Carol I Park','Izvor Park','Cismigiu Gardens','Village Museum','National Museum of Art','Calea Victoriei','Botanical Garden','Cotroceni Palace','National History Museum','Tineretului Park','Carturesti Carusel','Obor Market'].map((name,index)=>({id:randomUUID(),trip_id:trip.id,name,priority:'preferred',selection_source:'ai',desired_duration_min:90,address:name+', Bucharest',lat:44.43+index*0.001,lng:26.09,status:'resolved',category:index%2?'nature':'history'}));
 await api(`/trips/${trip.id}/planning/places`,{items:[...desired,...optional]},'PUT');
 await browser.navigate(root+`/trip/${trip.id}/plan?step=5`);await text('Generate itinerary');await click('Generate itinerary');await wait("document.body.innerText.includes('View full itinerary')",150000);
 let plan=await api(`/trips/${trip.id}/itinerary`);report.generation=plan.generation;
 assert.deepEqual(plan.conflicts,[]);assert(plan.unscheduledOptional.length>0);
 for(const p of desired)assert(plan.items.some(item=>item.selection_id===p.id));
 const transfer=plan.items.find(item=>item.step_type==='transport');assert.equal(transfer.start_datetime,'2026-10-01T23:22');assert(transfer.end_datetime.startsWith('2026-10-02'));
 assert.equal(plan.items.filter(i=>i.step_type==='visit').length+plan.unscheduledOptional.length,18);
 await text('optional ideas saved for later');assert(!await evaluate("document.body.innerText.includes('Scheduling conflicts')"));
 await evaluate("document.querySelector('[data-optional-places]').open=true");await browser.screenshot('final-step');pass('Generation prioritizes both desired places, preserves overnight transfer, saves excess optional suggestions without warnings');
 await click('View full itinerary');await text('Your itinerary');await text('(+1 day)');await text('Itinerary ready');
 await evaluate("document.querySelector('[data-optional-places]').open=true");await browser.screenshot('itinerary-desktop');
 await command('Page.reload');await browser.pause(600);await text('Your itinerary');const loaded=await api(`/trips/${trip.id}/itinerary`);assert.deepEqual(loaded,plan);
 const [stored]=await pool.execute('SELECT itinerary_meta FROM trips WHERE id=? AND owner_id=?',[trip.id,owner]);const meta=JSON.parse(stored[0].itinerary_meta);assert.equal(meta.scheduler_version,2);assert.deepEqual(meta.unscheduled_optional,plan.unscheduledOptional);pass('Full datetimes and optional metadata persist in MySQL and survive reload');
 await evaluate("document.querySelector('[data-optional-places]').open=true");await click('Review options','a');await text('Desired places');await wait("document.querySelectorAll('[data-desired-place]').length===18");pass('Review options opens all saved places for later promotion, replacement or removal');
 await browser.navigate(root+`/trip/${trip.id}/itinerary`);await text('Your itinerary');
 const downloads=path.join(directory,'downloads-'+owner);await mkdir(downloads,{recursive:true});await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await click('Download PDF');
 let file;for(let attempt=0;attempt<120;attempt++){await browser.pause(250);file=(await readdir(downloads)).find(name=>name.endsWith('.pdf'));if(file)break;}assert(file,'PDF download missing');const pdf=await readFile(path.join(downloads,file));assert.equal(pdf.subarray(0,5).toString(),'%PDF-');report.pdf=path.join(downloads,file);pass('Visible Download PDF button exports the saved itinerary');
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await browser.pause(300);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));await browser.screenshot('itinerary-mobile');
 assert.deepEqual(browser.exceptions,[]);assert(!browser.requests.some(url=>/base44\.(com|app)/.test(url)));pass('Desktop/mobile itinerary renders without overflow, JavaScript errors or Base44 calls');
 report.optionalCount=plan.unscheduledOptional.length;report.visitCount=plan.items.filter(i=>i.step_type==='visit').length;report.transfer={start:transfer.start_datetime,end:transfer.end_datetime};report.success=true;
} catch(error) {report.success=false;report.error=error.message;process.exitCode=1;console.error(error);await browser?.screenshot('failure').catch(()=>{});}
finally {await browser?.close();await pool.execute('DELETE FROM users WHERE id=?',[owner]);await pool.end();await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
