// Explicit, opt-in live tests: invokes paid providers through the running application.
// Creates a temporary account in the app database and removes only its own records/files.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../server/db.js';
import { config } from '../server/config.js';
import { hashPassword } from '../server/security.js';
import { samePlace } from '../src/lib/place-matching.js';
import { violatesExclusions } from '../server/planning-suggestions.js';

assert(process.argv.includes('--live'), 'Pass --live to authorize real Google/OpenAI calls.');
const root = 'http://127.0.0.1:5173';
const output = path.resolve('.local/live-planning');
const reportFile = path.join(output, process.argv.includes('--ui-only') ? 'ui-report.json' : 'report.json');
await mkdir(output, { recursive: true });
const id = randomUUID(), email = `${id}@live-check.example.test`, password = randomUUID() + 'Test!';
const report = { date: new Date().toISOString(), checks: [] };
const passed = async (name, details = {}) => { report.checks.push({ name, ...details }); console.log('PASS:', name, JSON.stringify(details)); await writeFile(reportFile, JSON.stringify(report, null, 2)); };
let chrome, browser, command, sessionId, evaluate;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await pool.execute('INSERT INTO users (id,email,password_hash,email_verified,display_name) VALUES (?,?,?,TRUE,?)', [id,email,await hashPassword(password),'Live Verification']);
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--remote-debugging-port=0','--no-first-run','--no-default-browser-check','--user-data-dir=' + path.join(output,'profile'),'about:blank'], { windowsHide: true, stdio:['ignore','ignore','pipe'] });
  const endpoint = await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('Chrome startup timed out')),20000);
    chrome.on('error',reject);chrome.stderr.on('data',chunk=>{const match=chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
  });
  browser=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{browser.addEventListener('open',resolve);browser.addEventListener('error',reject);});
  let seq=0;const pending=new Map(),requests=[],exceptions=[];
  browser.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id&&pending.has(message.id)){const {resolve,reject,timer}=pending.get(message.id);pending.delete(message.id);clearTimeout(timer);message.error?reject(new Error(message.error.message)):resolve(message.result);}
    if(message.method==='Network.requestWillBeSent')requests.push(message.params.request.url);
    if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails.text);
  });
  command=(method,params={},session=sessionId)=>new Promise((resolve,reject)=>{const requestId=++seq;const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('Timeout '+method));},150000);pending.set(requestId,{resolve,reject,timer});browser.send(JSON.stringify({id:requestId,method,params,...(session?{sessionId:session}:{})}));});
  const target=await command('Target.createTarget',{url:'about:blank'});
  ({sessionId}=await command('Target.attachToTarget',{targetId:target.targetId,flatten:true}));
  for(const domain of ['Page','Network','Runtime','DOM'])await command(domain+'.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||'Evaluation failed');return result.result.value;};
  const wait=async(expression,timeout=18000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await delay(200);}throw new Error('Wait failed: '+expression);};
  const text=expected=>wait(`document.body.innerText.toLowerCase().includes(${JSON.stringify(expected.toLowerCase())})`);
  const input=async(selector,value)=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(100);};
  const clickText=async(value,scope='button')=>evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(scope)})].find(el=>el.textContent.trim().includes(${JSON.stringify(value)}));if(!el)throw Error('Missing button');el.click();})()`);
  const screenshot=async name=>{const shot=await command('Page.captureScreenshot',{format:'png'});await writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
  const api=async(url,body,method='POST')=>{const result=await evaluate(`fetch(${JSON.stringify('/api'+url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(result.status<400,JSON.stringify(result));return result.data;};
  await command('Page.navigate',{url:root+'/login'});await text('Welcome back');
  await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('New Trip');
  await clickText('New Trip');await text('Where to next?');
  const choose=async(selector,query,expected)=>{
    await input(selector,query);
    await wait(`!!document.querySelector(${JSON.stringify(selector)})?.closest('.relative')?.querySelector('[role="option"]')`);
    const labels=await evaluate(`[...document.querySelector(${JSON.stringify(selector)}).closest('.relative').querySelectorAll('[role="option"]')].map(el=>el.textContent)`);
    assert(labels.some(label=>label.toLowerCase().includes(expected.toLowerCase())),JSON.stringify(labels));
    await evaluate(`(()=>{const list=[...document.querySelector(${JSON.stringify(selector)}).closest('.relative').querySelectorAll('[role="option"]')];(list.find(el=>el.textContent.toLowerCase().includes(${JSON.stringify(expected.toLowerCase())}))||list[0]).click();})()`);
    await wait(`!document.querySelector(${JSON.stringify(selector)}).closest('.relative').innerText.includes('Loading place details')`);
    await delay(150);
    return labels;
  };
  await choose('#trip-destination','Tokyo','Tokyo');await passed('Initial autocomplete: Tokyo');
  await choose('#trip-destination','Barcelona','Barcelona');await passed('Initial autocomplete: Barcelona');
  await input('#trip-name','Live planning verification');
  await evaluate("document.getElementById('travel-type').value='plane';document.getElementById('travel-type').dispatchEvent(new Event('change',{bubbles:true}))");
  await clickText("Let's go");await text('Plan your trip');
  const tripId=await evaluate("location.pathname.split('/')[2]");
  let trip=await api('/entities/Trip/'+tripId,undefined,'GET');
  assert(trip.destination_place_id&&trip.country&&trip.destination_formatted_address&&trip.destination_latitude);
  await passed('Google details persist', { timezone: trip.timezone || 'not resolved' });
  await api('/entities/Trip/'+tripId,{start_date:'2026-10-01',end_date:'2026-10-03',timezone:trip.timezone||'Europe/Madrid',exclusions:'No museums, No shopping',interests:'Nature, architecture',pace:'relaxed',max_walk_per_day_min:90,max_walk_per_segment_min:20,buffer_min:15,meal_duration_min:60},'PATCH');
  await command('Page.navigate',{url:root+'/trip/'+tripId+'/plan'});await text('Destination & time');
  await choose('#planner-destination','Barcelona','Barcelona');
  await choose('#arrival-location','Barcelona airport','BCN');
  await choose('#departure-location','Barcelona airport','BCN');
  await delay(900);trip=await api('/entities/Trip/'+tripId,undefined,'GET');
  for(const direction of ['arrival','departure'])for(const suffix of ['place_id','address','country','lat','lng'])assert(trip[direction+'_'+suffix]!=null,suffix);
  await passed('Planner destination and airport fields save structured Google data');
  // Instrument the REAL native showPicker, then invoke it using trusted CDP pointer events.
  await evaluate(`(()=>{const original=HTMLInputElement.prototype.showPicker;window.__picker=[];HTMLInputElement.prototype.showPicker=function(){try{const result=original.call(this);window.__picker.push({type:this.type,ok:true});return result;}catch(error){window.__picker.push({type:this.type,ok:false,error:error.name});throw error;}};})()`);
  const picker=async(selector,name)=>{
    for(const [position,ratio] of [['left',0.025],['middle',0.5],['date-text',0.22],['icon',0.95]]){
      const rect=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
      await delay(100);
      const before=await evaluate('window.__picker.length');
      const x=rect.x+rect.width*ratio,y=rect.y+rect.height/2;
      await command('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
      await delay(100);
      const calls=await evaluate(`window.__picker.slice(${before})`);
      assert(calls.some(call=>call.ok),`${name} ${position}: native picker not opened: ${JSON.stringify(calls)}`);
      if(position==='middle')await screenshot('picker-'+name);
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    }
    await passed('Native picker four click positions: '+name);
  };
  await picker('input[type=date]','trip-arrival');
  await evaluate("document.querySelectorAll('input[type=date]')[1].setAttribute('data-live-departure','')");
  await picker('[data-live-departure]', 'trip-departure');
  await picker('input[type=datetime-local]','arrival-datetime');
  await picker('input[aria-label="Local departure date and time"]','departure-datetime');
  // Synthetic PDF, never a real reservation. Valid PDF offsets/xref for vision extraction.
  const lines=['SAMPLE RESERVATION - TEST DATA ONLY','Hotel Example Garden','12 Example Street, Barcelona, Spain','Check-in: 2026-10-01 at 15:00','Check-out: 2026-10-03 at 11:00','Confirmation: TEST-ONLY-4821'];
  const stream='BT /F1 18 Tf 50 740 Td '+lines.map((line,i)=>(i?'0 -35 Td ':'')+'('+line+') Tj').join('\n')+' ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const pdfPath=path.join(output,'sample-reservation.pdf');await writeFile(pdfPath,pdf);
  const upload=async(selector,filePath)=>{const {root:document}=await command('DOM.getDocument');const {nodeId}=await command('DOM.querySelector',{nodeId:document.nodeId,selector});assert(nodeId);await command('DOM.setFileInputFiles',{nodeId,files:[filePath]});await delay(900);};
  await upload('input[aria-label="Arrival ticket"]',pdfPath);await text('View / download arrival ticket');
  await delay(700);trip=await api('/entities/Trip/'+tripId,undefined,'GET');assert(trip.arrival_ticket_url);
  assert.equal((await fetch(root+trip.arrival_ticket_url)).status,401);
  const step=async(name,expected)=>{await evaluate(`[...document.querySelectorAll('header button')].find(el=>el.textContent.endsWith(${JSON.stringify(name)})).click()`);await text(expected);};
  await step('Stay','Have you booked your stay?');await clickText("Yes, I've booked");
  await choose('#stay-hotel','Hotel Barcelona Universal','Barcelona Universal');
  await delay(700);
  let stays=await api('/entities/TripItem?filter='+encodeURIComponent(JSON.stringify({trip_id:tripId,category:'stay'})),undefined,'GET');
  assert(stays[0].place_id&&stays[0].address&&stays[0].lat&&stays[0].country);
  await passed('Real hotel autocomplete: Hotel Barcelona Universal');
  await picker('input[type=date]','hotel-check-in');await picker('input[type=time]','hotel-check-in-time');
  await evaluate("document.querySelectorAll('input[type=date]')[1].setAttribute('data-live-checkout','');document.querySelectorAll('input[type=time]')[1].setAttribute('data-live-checkout-time','')");
  await picker('[data-live-checkout]','hotel-check-out');await picker('[data-live-checkout-time]','hotel-check-out-time');
  // Google address lookup is independently exercised.
  await choose('#stay-address','Hotel Barcelona Universal','Barcelona Universal');
  if (process.argv.includes('--ui-only')) {
    await upload('input[aria-label="Reservation PDF / image"]',pdfPath);await text('Extract reservation details');
    assert.equal(await evaluate("getComputedStyle([...document.querySelectorAll('button')].find(el=>el.textContent==='Extract reservation details')).color"),'rgb(255, 255, 255)');
    await screenshot('reservation-upload-controls');await passed('Reservation extraction action remains readable on dark background');
  } else {
  await input('input[placeholder^="https://booking"]','https://www.booking.com/hotel/es/arcelon.html');
  await clickText('Read');
  await wait(`!!document.querySelector('[aria-label="Hotel import preview"]') || document.body.innerText.includes('Could not reliably identify') || document.body.innerText.includes('OpenAI ')`,140000);
  const bookingPreview=await evaluate(`!!document.querySelector('[aria-label="Hotel import preview"]')`);
  if(bookingPreview){const data=await evaluate(`({title:document.querySelector('[aria-label="Preview Hotel name"]').value,address:document.querySelector('[aria-label="Preview Address"]').value,warnings:document.querySelector('[aria-label="Hotel import preview"]').innerText.slice(0,800)})`);assert(data.title&&data.address);await passed('Booking URL fallback preview (unverified)',data);await clickText('Discard preview');}
  else { const body=await evaluate('document.body.innerText');assert(body.includes('Could not reliably identify'),body.slice(-1200));await passed('Booking blocks extraction: explicit manual/document fallback'); }
  await upload('input[aria-label="Reservation PDF / image"]',pdfPath);await text('Extract reservation details');await delay(600);
  const beforeExtract=await api('/entities/TripItem?filter='+encodeURIComponent(JSON.stringify({trip_id:tripId,category:'stay'})),undefined,'GET');
  await clickText('Extract reservation details');await wait(`!!document.querySelector('[aria-label="Hotel import preview"]')`,140000);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Preview Confirmation / reference"]').value`),'TEST-ONLY-4821');
  const pendingStay=await api('/entities/TripItem?filter='+encodeURIComponent(JSON.stringify({trip_id:tripId,category:'stay'})),undefined,'GET');
  assert.equal(pendingStay[0].title,beforeExtract[0].title,'AI preview must not overwrite saved hotel');
  await screenshot('reservation-preview');await clickText('Confirm hotel details');await delay(900);
  stays=await api('/entities/TripItem?filter='+encodeURIComponent(JSON.stringify({trip_id:tripId,category:'stay'})),undefined,'GET');
  assert.equal(stays[0].confirmation_number,'TEST-ONLY-4821');assert.equal(stays[0].source_status,'confirmed_by_user');assert.equal(stays[0].date,'2026-10-01');assert(stays[0].reservation_file_url);
  await passed('Real OpenAI PDF extraction: preview, confirmation and persistence');
  // Render the same synthetic reservation into PNG in a separate Chrome target.
  const imageTarget=await command('Target.createTarget',{url:'about:blank'});const imageSession=(await command('Target.attachToTarget',{targetId:imageTarget.targetId,flatten:true})).sessionId;
  await command('Page.enable',{},imageSession);await command('Runtime.evaluate',{expression:`document.body.innerHTML=${JSON.stringify('<main style="font:24px Arial;padding:40px">'+lines.map(line=>'<p>'+line+'</p>').join('')+'</main>')}`},imageSession);
  const shot=await command('Page.captureScreenshot',{format:'png'},imageSession);const imagePath=path.join(output,'sample-reservation.png');await writeFile(imagePath,Buffer.from(shot.data,'base64'));await command('Target.closeTarget',{targetId:imageTarget.targetId});
  await upload('input[aria-label="Reservation PDF / image"]',imagePath);await delay(600);await clickText('Extract reservation details');await wait(`!!document.querySelector('[aria-label="Hotel import preview"]')`,140000);
  assert.equal(await evaluate(`document.querySelector('[aria-label="Preview Confirmation / reference"]').value`),'TEST-ONLY-4821');await clickText('Discard preview');await passed('Real OpenAI screenshot extraction');
  // Restore a real hotel for the practical AI suggestions test.
  await choose('#stay-hotel','Hotel Barcelona Universal','Barcelona Universal');
  await step('Desired places','Search a desired place');
  for(const query of ['Sagrada','Park Guell','Sagrada'])await choose('#desired-place-search',query,query==='Sagrada'?'Sagrada':'Güell');
  await text('already in your list');await delay(900);
  const places=await api('/entities/PlaceSelection?filter='+encodeURIComponent(JSON.stringify({trip_id:tripId})),undefined,'GET');
  assert.equal(places.length,2);assert(places.every(place=>place.place_id&&place.country&&place.lat));
  await passed('Desired places: Sagrada Familia, Park Güell, duplicate prevention and persistence');
  await step('Suggestions','Additional activities');await wait(`document.querySelectorAll('[data-suggestion-card]').length>0`,140000);
  const titles=await evaluate(`[...document.querySelectorAll('[data-suggestion-card] h3')].map(el=>el.textContent)`);
  assert(titles.length>0);assert(titles.every(name=>!places.some(place=>samePlace(place,{name}))));assert.equal(new Set(titles.map(name=>name.toLowerCase())).size,titles.length);
  const cards=await evaluate(`[...document.querySelectorAll('[data-suggestion-card]')].map(el=>({name:el.querySelector('h3').textContent,category:el.querySelectorAll('p')[1].textContent.split(' · ')[0]}))`);
  assert(cards.every(card=>!violatesExclusions(card,'No museums, No shopping')));
  await screenshot('live-suggestions');await passed('Real OpenAI Suggestions: selected places excluded, no duplicates/museums/shopping',{names:titles});
  await evaluate(`document.querySelector('[data-suggestion-card] button').click()`);await text('Accepted');await delay(800);
  await step('Trip','Destination & time');await command('Page.reload');await text('Destination & time');assert.equal(await evaluate("document.getElementById('arrival-location').value"),trip.arrival_location);
  await text('View / download arrival ticket');
  await command('Page.navigate',{url:root+'/trip/'+tripId+'/itinerary'});await text('Private tickets & reservations');assert(await evaluate(`!!document.querySelector('a[href=${JSON.stringify(trip.arrival_ticket_url)}]')`));
  const shared=await api('/trips/'+tripId+'/share',{enabled:true,hideStay:true});const publicResponse=await fetch(root+'/api/shared/'+shared.share_token);assert(!(await publicResponse.text()).includes('/api/uploads/'));
  assert(!requests.some(url=>/base44\.(com|app)|api\.openai\.com|places\.googleapis\.com/.test(url)), 'Provider secrets/calls must remain on backend');assert.deepEqual(exceptions,[]);
  await passed('Tickets survive reload, remain accessible from itinerary, and are excluded from public sharing');
  }
  report.success=true;
} catch(error) {
  report.success=false;report.error=error.message;console.error(error);
  if(evaluate)console.error((await evaluate('document.body.innerText').catch(()=>''))?.slice(-2500));
  if(command&&sessionId){const shot=await command('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(shot)await writeFile(path.join(output,'failure.png'),Buffer.from(shot.data,'base64'));}
  process.exitCode=1;
} finally {
  if(command)await command('Browser.close',{},undefined).catch(()=>{});
  browser?.close();chrome?.kill();
  const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[id]);
  await pool.execute('DELETE FROM users WHERE id=?',[id]);
  for(const file of files)if(path.basename(file.filename)===file.filename)await unlink(path.join(config.uploads,file.filename)).catch(()=>{});
  await pool.end();await writeFile(reportFile,JSON.stringify(report,null,2));
}
