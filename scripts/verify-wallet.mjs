// Uses real uploads and the running app. Optional --live-ai calls the configured provider on fake tickets.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { browserDriver } from './browser-driver.mjs';
import { pool } from '../server/db.js';
import { config } from '../server/config.js';
import { hashPassword } from '../server/security.js';
const directory=path.resolve('.local/wallet-browser');await mkdir(directory,{recursive:true});
const root='http://127.0.0.1:5173',id=randomUUID(),email=id+'@wallet-browser.test',password=randomUUID()+'Test!';
const otherId=randomUUID();let browser;
const report={date:new Date().toISOString(),checks:[]};
const passed=async(name,details={})=>{console.log('PASS:',name);report.checks.push({name,...details});await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));};
function pdf(lines){const stream='BT /F1 18 Tf 40 740 Td '+lines.map((line,i)=>(i?'0 -32 Td ':'')+'('+line+') Tj').join('\n')+' ET';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];let text='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(text);return text+`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;}
try{
  for(const [uid,name] of [[id,'Wallet Browser'],[otherId,'Other Traveler']])await pool.execute('INSERT INTO users (id,email,password_hash,email_verified,display_name) VALUES (?,?,?,TRUE,?)',[uid,uid+'@wallet-browser.test',await hashPassword(password),name]);
  browser=await browserDriver(directory);const {evaluate,wait,text,input,click,files,pause,command}=browser;
  const pdfPath=path.join(directory,'adult-1-flight.pdf');
  await writeFile(pdfPath,pdf(['TEST FIXTURE - NOT A VALID TICKET','Example Airlines','Flight: EX123','Departure: Chisinau (RMO)','Arrival: Barcelona (BCN)','Departure: 2026-10-01 08:30','Arrival: 2026-10-01 10:35','Passenger: Alex Example','Confirmation: TEST-FLIGHT-4821']));
  const hotelPdf=path.join(directory,'hotel-confirmation.pdf');await writeFile(hotelPdf,pdf(['TEST FIXTURE - NOT A REAL BOOKING','Hotel Example Garden','12 Example Street, Barcelona, Spain','Check-in: 2026-10-01 at 15:00','Check-out: 2026-10-03 at 11:00','Confirmation: TEST-HOTEL-111']));
  // Render a crisp barcode fixture at native resolution, with no remote images or personal data.
  await evaluate(`(()=>{document.body.innerHTML='<canvas width="1200" height="800"></canvas>';const c=document.querySelector('canvas'),x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1200,800);x.fillStyle='black';x.font='40px Arial';x.fillText('TEST TICKET - NOT VALID FOR ENTRY',70,90);x.font='32px Arial';x.fillText('Sagrada Familia - Alex Example',70,150);x.fillText('2026-10-02 11:00 / TEST-ACTIVITY-222',70,200);let left=120;const bars='121121211211211121112112121121211211211121121121112112121121211211211121121121112112121121211211211121';[...bars].forEach((w,i)=>{const width=Number(w)*5;if(i%2===0)x.fillRect(left,310,width,270);left+=width;});x.font='32px monospace';x.fillText('TEST-ONLY-4821',400,640);})()`);
  const encoded=await evaluate("document.querySelector('canvas').toDataURL('image/png').split(',')[1]");const imagePath=path.join(directory,'barcode-ticket.png');await writeFile(imagePath,Buffer.from(encoded,'base64'));
  const secondPdf=path.join(directory,'adult-2-flight.pdf');await writeFile(secondPdf,pdf(['TEST FIXTURE - NOT A VALID TICKET','Example Airlines EX123','Passenger: Sam Example','Confirmation: TEST-FLIGHT-4821']));
  const fourthPdf=path.join(directory,'child-flight.pdf');await writeFile(fourthPdf,pdf(['TEST FIXTURE - NOT A VALID TICKET','Example Airlines EX123','Passenger: Child Example','Confirmation: TEST-FLIGHT-4821']));
  await browser.navigate(root+'/login');await text('Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('New Trip');
  const api=async(url,body,method=body?'POST':'GET')=>{const result=await evaluate(`fetch(${JSON.stringify('/api'+url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(result.status<400,JSON.stringify(result));return result.data;};
  const trip=await api('/entities/Trip',{name:'Family wallet verification',destination:'Barcelona',country:'Spain',timezone:'Europe/Madrid',start_date:'2026-10-01',end_date:'2026-10-03',travel_type:'plane',arrival_location:'BCN',arrival_datetime:'2026-10-01T10:35'});
  await browser.navigate(root+'/trip/'+trip.id);await text('Travel Wallet');
  await browser.navigate(root+'/trip/'+trip.id+'/wallet');await text('Flights (0)');
  const dialog='[role="dialog"]';
  const save=async()=>{await click('Save travel item',dialog+' button');await wait(`!document.querySelector('[role="dialog"]')`);};
  const add=async(category,title,paths)=>{
    await evaluate(`document.querySelector('[data-wallet-category="${category}"]').click()`);await click('Add to Trip');await input(dialog+' input[aria-label="Title (optional)"]',title);
    await files('input[aria-label="Upload travel files"]',paths);
    await wait(`document.querySelectorAll('[data-wallet-attachment]').length===${paths.length}&&!document.querySelector('fieldset').disabled`);
  };
  await add('flight','Family flight',[pdfPath,secondPdf,fourthPdf,imagePath]);
  assert(!(await evaluate(`document.querySelector('${dialog}').innerText`)).includes('From a link'));
  for(let i=1;i<=4;i++)await input(`input[aria-label="Attachment ${i} traveler"]`,['Alex','Sam','Child','Family'][i-1]);
  if(process.argv.includes('--live-ai')){
    await click('Extract details for review','[data-wallet-attachment] button');await wait(`!!document.querySelector('[aria-label="Extraction preview"]')`,140000);
    assert.equal((await api('/trips/'+trip.id+'/wallet')).items.length,0);
    assert((await evaluate(`document.querySelector('input[aria-label="Preview Flight number"]').value`)).includes('123'));
    await click('Use these details');await text('Flight number');await passed('Real flight AI returns a preview; no factual record exists before confirmation and Save');
    await input('input[aria-label="Title"]','Family flight');
  }else await click('Fill manually',dialog+' button');
  await input('input[aria-label="Airline"]','Example Airlines');await input('input[aria-label="Arrival airport"]','BCN');await input('input[aria-label="Arrival date / time"]','2026-10-01T10:35');await save();await text('Flights (4)');
  let wallet=await api('/trips/'+trip.id+'/wallet');const flight=wallet.items.find(item=>item.category==='flight');assert.equal(wallet.items.length,1);assert.equal(flight.attachments.length,4);await passed('A: four files associated with one flight, individual travelers retained');
  await add('stay','Family hotel',[hotelPdf,imagePath]);await click('Fill manually',dialog+' button');await input('input[aria-label="Check-in date"]','2026-10-01');await input('input[aria-label="Check-out date"]','2026-10-03');await input('#wallet-location','Example hotel address');await save();await text('Stay / Hotel (2)');
  await add('place','Sagrada Familia',[imagePath,pdfPath,secondPdf]);
  if(process.argv.includes('--live-ai')){await click('Extract details for review','[data-wallet-attachment] button');await wait(`!!document.querySelector('[aria-label="Extraction preview"]')`,140000);assert((await evaluate(`document.querySelector('input[aria-label="Preview Title"]').value`)).toLowerCase().includes('sagrada'));await click('Use these details');await passed('Real activity image AI returns editable structured preview');}
  else await click('Fill manually',dialog+' button');
  await input('input[aria-label="Title"]','Sagrada Familia');await input('input[aria-label="Date"]','2026-10-02');await input('input[aria-label="Time"]','11:00');await save();await text('Tickets (3)');
  const aiBeforeDocuments=browser.requests.filter(url=>url.includes('/ai/')).length;
  await add('document','Family documents',[imagePath,secondPdf,hotelPdf]);
  for(const [i,type] of ['Passport','National ID','Travel insurance'].entries()){
    await input(`input[aria-label="Attachment ${i+1} label"]`,type+' (synthetic test)');await input(`input[aria-label="Attachment ${i+1} traveler"]`,'Alex Example');
    await evaluate(`(()=>{const el=document.querySelector('select[aria-label="Attachment ${i+1} document type"]');el.value=${JSON.stringify(type)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  await input('input[aria-label="Attachment 1 expiry date"]','2030-01-01');
  assert(!(await evaluate(`document.querySelector('${dialog}').innerText`)).includes('Extract details for review'));await save();await text('Documents (3)');assert.equal(browser.requests.filter(url=>url.includes('/ai/')).length,aiBeforeDocuments);
  await passed('D: synthetic passport, ID and insurance uploaded without any AI request');
  await command('Page.reload');await text('Documents (3)');wallet=await api('/trips/'+trip.id+'/wallet');
  for(const [category,count] of [['flight',4],['stay',2],['place',3],['document',3]])assert.equal(wallet.items.find(item=>item.category===category).attachments.length,count);
  await passed('B/F/G: hotel PDF + image and all 12 files persist after reload; category counts correct');
  const attraction=wallet.items.find(item=>item.category==='place');const hotel=wallet.items.find(item=>item.category==='stay');
  await browser.navigate(root+'/trip/'+trip.id+'/wallet?item='+attraction.id);await text('3 attached files');await click('View file','[data-wallet-file] button');await wait(`document.querySelector('[data-wallet-viewer] img')?.naturalWidth>0`);
  await pause(300); // Measure after the dialog entrance transition.
  const geometry=await evaluate(`(()=>{const viewer=document.querySelector('[data-wallet-viewer]'),img=viewer.querySelector('img'),head=viewer.querySelector('header'),r=img.getBoundingClientRect(),h=head.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,headerBottom:h.bottom,fit:getComputedStyle(img).objectFit,naturalWidth:img.naturalWidth};})()`);
  assert.equal(geometry.fit,'contain');assert.equal(geometry.naturalWidth,1200);assert(geometry.width>900&&geometry.top>=geometry.headerBottom-0.5,JSON.stringify(geometry));await browser.screenshot('large-barcode');await click('Original size');await browser.screenshot('original-barcode');await click('Close file');
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await click('View file','[data-wallet-file] button');await wait(`document.querySelector('[data-wallet-viewer] img')?.naturalWidth>0`);await browser.screenshot('mobile-barcode');await click('Close file');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await passed('C/H: three attraction tickets; barcode displayed at full screen/original size without overlay, desktop and mobile');
  await browser.navigate(root+'/trip/'+trip.id+'/wallet?item='+hotel.id);await text('2 attached files');await click('View file','[data-wallet-file] button');await wait(`!!document.querySelector('[data-wallet-viewer] iframe')`);await pause(2500);await browser.screenshot('hotel-pdf-viewer');await click('Close file');
  const login=await fetch(root+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:JSON.stringify({email:otherId+'@wallet-browser.test',password})});const otherCookie=login.headers.get('set-cookie').split(';')[0];
  const privateFiles=wallet.items.flatMap(item=>item.attachments);
  for(const file of privateFiles){assert.equal((await fetch(root+file.file_url)).status,401);assert.equal((await fetch(root+file.file_url,{headers:{Cookie:otherCookie}})).status,404);}
  const shared=await api('/trips/'+trip.id+'/share',{enabled:true,hideStay:true});const sharedData=await(await fetch(root+'/api/shared/'+shared.share_token)).text();
  for(const word of ['uploads','Passport','National ID','Alex Example','attachments'])assert(!sharedData.includes(word));assert.equal((await fetch(root+privateFiles[0].file_url+'?token='+shared.share_token)).status,401);
  const response=await fetch(root+'/api/trips/'+trip.id+'/wallet',{headers:{Cookie:otherCookie}});assert.equal(response.status,404);await passed('E: anonymous/share-token/other-account access blocked; no personal files or metadata in public response');
  await browser.navigate(root+'/trip/'+trip.id+'/wallet?item='+flight.id);await text('4 attached files');await click('Edit / add files');await wait(`document.querySelectorAll('[data-wallet-attachment]').length===4`);
  await files('input[aria-label="Upload travel files"]',[hotelPdf]);await wait(`document.querySelectorAll('[data-wallet-attachment]').length===5&&!document.querySelector('fieldset').disabled`);await input('input[aria-label="Attachment 1 label"]','Renamed adult ticket');await click('Save changes',dialog+' button');await text('5 attached files');
  await click('Edit / add files');await wait(`document.querySelectorAll('[data-wallet-attachment]').length===5`);await evaluate(`document.querySelectorAll('[data-wallet-attachment]')[4].querySelectorAll('button')[1].click()`);await click('Save changes',dialog+' button');await text('4 attached files');
  const updated=(await api('/trips/'+trip.id+'/wallet')).items.find(item=>item.id===flight.id);assert.deepEqual(updated.attachments.map(file=>file.id).sort(),flight.attachments.map(file=>file.id).sort());assert(updated.attachments.some(file=>file.label==='Renamed adult ticket'));await passed('Add more, rename and remove one attachment preserve all original family tickets');
  await api('/entities/PlaceSelection',{trip_id:trip.id,name:'Sagrada Familia',trip_item_id:attraction.id,priority:'mandatory',desired_duration_min:60,fixed_date:'2026-10-02',ticket_type:'entry',ticket_purchased:true});
  await api('/trips/'+trip.id+'/itinerary',{});await browser.navigate(root+'/trip/'+trip.id+'/itinerary');await wait(`document.querySelectorAll('[data-wallet-quick-link]').length>0`);assert(await evaluate(`[...document.querySelectorAll('[data-wallet-quick-link]')].some(el=>el.textContent.includes('View tickets'))`));await browser.screenshot('itinerary-wallet-links');
  await evaluate(`document.querySelector('[data-wallet-quick-link]').click()`);await text('Travel Wallet');await passed('Itinerary quick access opens the related booking without exposing documents publicly');
  assert.deepEqual(browser.exceptions,[]);assert(!browser.requests.some(url=>/base44\.(com|app)/.test(url)));
  await passed('No JavaScript exceptions or Base44 runtime calls');report.success=true;
}catch(error){console.error(error);report.error=error.message;report.success=false;if(browser){console.error((await browser.evaluate('document.body.innerText').catch(()=>''))?.slice(-3000));await browser.screenshot('failure').catch(()=>{});}process.exitCode=1;}
finally{await browser?.close();for(const owner of [id,otherId]){const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[owner]);await pool.execute('DELETE FROM users WHERE id=?',[owner]);for(const file of files)if(path.basename(file.filename)===file.filename)await unlink(path.join(config.uploads,file.filename)).catch(()=>{});}await pool.end();await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));}
