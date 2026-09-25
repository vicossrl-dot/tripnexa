// Real Chrome + MySQL + configured Google/OpenAI. Disposable account, never edits user trips.
import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pool} from '../server/db.js';
import {hashPassword} from '../server/security.js';
import {browserDriver} from './browser-driver.mjs';
const directory=path.resolve('.local/functional-polish');await mkdir(directory,{recursive:true});
const root='http://127.0.0.1:5173',owner=randomUUID(),email=owner+'@polish.test',password=randomUUID()+'Test!';
const report={date:new Date().toISOString(),checks:[]};let browser;
const pass=message=>{report.checks.push(message);console.log('PASS:',message);};
try{
 await pool.execute('INSERT INTO users (id,email,password_hash,email_verified,display_name) VALUES (?,?,?,TRUE,?)',[owner,email,await hashPassword(password),'Functional Polish Test']);
 browser=await browserDriver(directory);const {evaluate,wait,text,input,click,command}=browser;

 const auditControls=async label=>{
  await command('CSS.enable');
  const controls=await evaluate("[...document.querySelectorAll('button,a')].filter(el=>el.offsetParent!==null).map((el,index)=>{el.dataset.controlAudit=String(index);return {index,label:el.textContent.trim().slice(0,60),primary:el.classList.contains('bg-lime')||el.classList.contains('primary'),disabled:!!el.disabled};})()");
  const {root:dom}=await command('DOM.getDocument');
  for(const control of controls){
   const {nodeId}=await command('DOM.querySelector',{nodeId:dom.nodeId,selector:'[data-control-audit="'+control.index+'"]'});
   for(const state of [[],['hover'],['active'],['focus','focus-visible']]){
    await command('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:state});
    const style=await evaluate(`(()=>{const e=document.querySelector('[data-control-audit="${control.index}"]'),s=getComputedStyle(e);return {bg:s.backgroundColor,color:s.color,outline:s.outlineStyle,shadow:s.boxShadow};})()`);
    if(!control.disabled&&control.primary){assert.notEqual(style.bg,style.color,label+': '+control.label);assert.notEqual(style.bg,'rgb(0, 0, 0)',label+': black primary hover');}
    if(state.includes('focus-visible'))assert(style.outline!=='none'||style.shadow!=='none',label+': no keyboard focus '+control.label);
   }
   await command('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
  }
  report.controlAudit??=[];report.controlAudit.push({page:label,controls:controls.length,states:['normal','hover','active','focus-visible','disabled when present']});
 };
 await browser.navigate(root+'/login');await text('Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('New Trip');
 const api=async(url,body,method=body?'POST':'GET')=>{const result=await evaluate(`fetch(${JSON.stringify('/api'+url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(result.status<400,JSON.stringify(result));return result.data;};
 const trip=await api('/entities/Trip',{name:'Bucharest, at our own pace',destination:'Bucharest',country:'Romania',timezone:'Europe/Bucharest',destination_latitude:44.4268,destination_longitude:26.1025,start_date:'2026-10-01',end_date:'2026-10-04',travel_type:'plane',adults:2,arrival_location:'Bucharest Henri Coanda Airport',arrival_datetime:'2026-10-01T09:00',arrival_lat:44.5711,arrival_lng:26.085,departure_location:'Bucharest Henri Coanda Airport',departure_datetime:'2026-10-04T20:00',departure_lat:44.5711,departure_lng:26.085,pace:'balanced',interests:'Landmarks,Nature,Food',exclusions:'No difficult trails',transport_preference:'taxi',max_walk_per_day_min:90,max_walk_per_segment_min:25,buffer_min:10,meal_duration_min:45,stay_status:'booked'});
 await api('/entities/TripItem',{trip_id:trip.id,category:'stay',title:'Central Bucharest stay',address:'Calea Victoriei 56, Bucharest',date:trip.start_date,end_date:trip.end_date,lat:44.438,lng:26.097,check_in_time:'15:00',check_out_time:'11:00'});
 const dates=['2026-10-01','2026-10-02','2026-10-03','2026-10-04'];
 await api(`/trips/${trip.id}/planning/windows`,{items:dates.map(date=>({id:randomUUID(),trip_id:trip.id,date,windows:'[{"start":"10:00","end":"19:00"}]',blocked:'[]',start_point:'Hotel',end_point:'Hotel'}))},'PUT');
 const desired=[];for(const [name,date]of [['Izvor Park','2026-10-02'],['Palace of Parliament',null]]){
  const resolution=await api('/places/resolve',{name,destination:trip.destination});const place=resolution.place||resolution.candidates[0];assert(place?.place_id);
  desired.push({...place,id:randomUUID(),trip_id:trip.id,priority:'mandatory',desired_duration_min:60,fixed_date:date,selection_source:'google',status:'resolved'});
 }
 await api(`/trips/${trip.id}/planning/places`,{items:desired},'PUT');
 const base='/trip/'+trip.id;
 await browser.navigate(root+base+'/plan?step=2');await text('Daily planning hours');
 const wishes='Keep one afternoon free and avoid early mornings.';
 await input('#special-wishes',wishes);await browser.pause(800);await wait("!document.body.innerText.includes('Saving…')");await command('Page.reload');await browser.pause(600);await wait(`document.querySelector('#special-wishes')?.value===${JSON.stringify(wishes)}`);assert.equal((await api('/entities/Trip/'+trip.id)).special_wishes,wishes);pass('Special wishes saved in MySQL and survive reload; Daily planning hours displayed');
 await evaluate("document.querySelector('[data-plan-step=\"4\"]').click()");await text('Step 5 of 6');
 await wait("document.querySelectorAll('[data-suggestion-card]').length>=3",150000);
 await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Accept'&&!b.disabled)",150000);
 await browser.screenshot('suggestions');await auditControls('Suggestions');
 for(let index=0;index<3;index++){
  await evaluate(`(()=>{const card=[...document.querySelectorAll('[data-suggestion-card]')].find(c=>[...c.querySelectorAll('button')].some(b=>b.textContent.trim()==='Accept'&&!b.disabled));if(!card)throw Error('No accept card');card.scrollIntoView({block:'center'});card.querySelector('button.bg-lime').click();})()`);
  await wait(`document.querySelectorAll('[data-suggestion-card]').length>0 && ([...document.querySelectorAll('[data-suggestion-card]')].filter(c=>c.innerText.includes('Accepted')).length>=${index+1} || document.body.innerText.includes('Confirm the location before accepting'))`);
  if(await evaluate("document.body.innerText.includes('Confirm the location before accepting')")){
   await evaluate("(()=>{const card=[...document.querySelectorAll('[data-suggestion-card]')].find(c=>c.innerText.includes('Confirm the location before accepting'));const choice=[...card.querySelectorAll('button')].find(b=>b.className.includes('text-left'));if(!choice)throw Error('Google did not resolve a candidate');choice.click();})()");
  }
  await wait(`[...document.querySelectorAll('[data-suggestion-card]')].filter(c=>c.innerText.includes('Accepted')).length>=${index+1}`);await browser.pause(800);
 }
 const saved=await api('/entities/PlaceSelection?filter='+encodeURIComponent(JSON.stringify({trip_id:trip.id})));const accepted=saved.filter(p=>p.selection_source==='ai'&&p.priority==='preferred');assert.equal(accepted.length,3);assert(accepted.every(p=>p.place_id&&p.lat!=null&&p.lng!=null&&p.address));report.accepted=accepted.map(p=>({name:p.name,place_id:p.place_id,duration:p.desired_duration_min}));pass('Three real AI suggestions resolved through Google, accepted and persisted with structured locations');
 await evaluate("document.querySelector('[data-suggestion-card]')?.scrollIntoView({block:'center'})");await wait("[...document.querySelectorAll('[data-suggestion-card] img')].some(i=>i.complete&&i.naturalWidth>0)",30000);
 await evaluate("[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.startsWith('View photo'))?.click()");await wait("!!document.querySelector('[role=dialog] img')");await browser.pause(300);await browser.screenshot('photo-lightbox');
 if(await evaluate("!document.querySelector('[role=dialog] button:last-child')?.disabled")){await evaluate("[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent.trim()==='Next photo'&&!b.disabled)?.click()");}
 await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('[role=dialog]')");pass('Real Google photographs load; lightbox, next and Escape work');
 await evaluate("document.querySelector('[data-plan-step=\"5\"]').click()");await text('Generate itinerary');await click('Generate itinerary');await wait("document.body.innerText.includes('View full itinerary')",150000);
 let plan=await api(`/trips/${trip.id}/itinerary`);assert.equal(plan.generation,'ai',plan.message);
 for(const p of saved)assert(plan.items.some(i=>i.selection_id===p.id)||plan.conflicts.some(c=>c.place===p.name),'Selected place silently lost: '+p.name);
 assert.equal(plan.items.filter(i=>i.step_type==='visit').length,saved.length,JSON.stringify(plan.conflicts));
 assert(plan.items.filter(i=>i.step_type==='visit').every(i=>i.start_time>='10:00'&&i.end_time<='19:00'));
 assert(dates.some(date=>!plan.items.some(i=>i.date===date&&i.step_type==='visit'&&i.end_time>'13:00')),'No free afternoon');
 await click('View full itinerary');await text('Your itinerary');await wait("document.querySelectorAll('[data-itinerary-day]').length===4");await browser.screenshot('itinerary');pass('Generate and open itinerary: every desired/accepted place scheduled once, planning hours and free afternoon respected');
 const before=JSON.stringify((await api(`/trips/${trip.id}/itinerary`)).items);
 await click('Change itinerary');await input('#itinerary-change','Move one activity from Day 2 to Day 3 and leave Day 2 afternoon free.');await click('Preview changes');await wait("!!document.querySelector('[data-change-preview]') || !!document.querySelector('[role=dialog] [role=alert]')",150000);assert(!await evaluate("!!document.querySelector('[role=dialog] [role=alert]')"),await evaluate("document.querySelector('[role=dialog]')?.innerText"));
 assert.equal(JSON.stringify((await api(`/trips/${trip.id}/itinerary`)).items),before);await browser.screenshot('change-preview');await click('Apply changes');await text('Itinerary changes saved');plan=await api(`/trips/${trip.id}/itinerary`);assert(plan.items.filter(i=>i.date===dates[1]&&i.step_type==='visit').every(i=>i.end_time<='13:00'));assert.equal((await api('/entities/Trip/'+trip.id)).special_wishes,wishes);await command('Page.reload');await browser.pause(600);await text('Your itinerary');assert.equal(JSON.stringify((await api(`/trips/${trip.id}/itinerary`)).items),JSON.stringify(plan.items));pass('Real AI change preview makes no writes; Apply persists, reload works, saved wishes unchanged');
 const downloadDirectory=path.join(directory,'downloads-'+owner);await mkdir(downloadDirectory,{recursive:true});
 await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDirectory});
 const beforeFiles=await readdir(downloadDirectory);await click('Download PDF');
 let pdfPath;for(let i=0;i<120;i++){await browser.pause(250);const files=await readdir(downloadDirectory);pdfPath=files.find(f=>f.endsWith('.pdf')&&!beforeFiles.includes(f));if(pdfPath)break;}assert(pdfPath,'PDF did not download');
 const pdf=await readFile(path.join(downloadDirectory,pdfPath));assert(pdf.subarray(0,5).toString()==='%PDF-');assert(pdf.length>10000);report.pdf=path.relative(directory,path.join(downloadDirectory,pdfPath));pass('Download PDF produces a real multi-day PDF from the visible action');
 for(const [width,height,label]of [[1440,1100,'desktop'],[390,844,'mobile']]){
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
  for(const [suffix,ready,name]of [['','Trip at a glance','overview'],['/plan?step=2','Daily planning hours','preferences'],['/plan?step=5','Regenerate itinerary','finalize'],['/itinerary','Your itinerary','itinerary'],['/wallet','Travel Wallet','wallet']]){
   await browser.navigate(root+base+suffix);await text(ready);await browser.pause(400);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),name+' overflow');
   const buttons=await evaluate("[...document.querySelectorAll('button.bg-lime,a.trip-button.primary,button.trip-button.primary')].filter(b=>!b.disabled).map(b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,label:b.textContent};}).filter(p=>p.x>0&&p.x<innerWidth&&p.y>0&&p.y<innerHeight)");
   for(const b of buttons){await command('Input.dispatchMouseEvent',{type:'mouseMoved',x:b.x,y:b.y});const colors=await evaluate(`(()=>{const el=document.elementFromPoint(${b.x},${b.y})?.closest('button,a');if(!el)return null;const s=getComputedStyle(el);return {background:s.backgroundColor,color:s.color};})()`);assert(!colors||colors.background!==colors.color,'Invisible button '+b.label);}
   await auditControls(label+'-'+name);await browser.screenshot(label+'-'+name);
  }
 }
 assert.deepEqual(browser.exceptions,[]);assert(!browser.requests.some(url=>/base44\.(com|app)/.test(url)));pass('Desktop/mobile pages and button hover render without overflow or JavaScript errors');
 report.success=true;
}catch(error){report.success=false;report.error=error.message;console.error(error);process.exitCode=1;if(browser){console.error((await browser.evaluate('document.body.innerText').catch(()=>''))?.slice(-3200));await browser.screenshot('failure').catch(()=>{});}}
finally{await browser?.close();await pool.execute('DELETE FROM users WHERE id=?',[owner]);await pool.end();await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
