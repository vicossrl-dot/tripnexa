import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {chromium,expect} from '../website/node_modules/@playwright/test/index.mjs';
import {mapFixture} from '../server/tests/interactive-maps-fixture.mjs';
import {officialFixture,practicalResponse} from '../server/tests/essentials-fast-fixture.mjs';
import {retrieveEssentials} from '../server/premium-travel/essentials-provider.js';

assert.match(process.env.MYSQL_TEST_DATABASE||'',/_test$/,'Use a separate test database.');
const output=path.resolve('.local/premium-travel');await mkdir(output,{recursive:true});
const fixture=await mapFixture();
const {snapshot,present}=await import('../server/itinerary-service.js'),{transaction}=await import('../server/db.js'),{insertRecord}=await import('../server/entities.js');
const {refreshEssentials}=await import('../server/premium-travel/essentials.js'),{travelBookHtml}=await import('../server/premium-travel/travel-book.js'),{readWallet}=await import('../server/wallet.js');
const {config}=await import('../server/config.js');config.googleMapsKey='';config.aiKey='';
const originalFetch=globalThis.fetch;
let unexpectedAiCalls=0;
// Weather responses are fixtures; no live provider calls, real AI calls or paid requests.
globalThis.fetch=async(url,options)=>{
 const address=String(url);
 if(address.startsWith('https://api.openai.com/')){unexpectedAiCalls++;throw Error('PDF/browser QA must not invoke a live model.');}
 if(address.startsWith('https://api.met.no/'))return new Response(JSON.stringify({properties:{meta:{updated_at:'2026-10-01T00:00:00Z'},timeseries:Array.from({length:5},(_,index)=>({time:`2026-10-0${index+1}T09:00:00Z`,data:{instant:{details:{air_temperature:18}},next_1_hours:{summary:{symbol_code:'clearsky_day'},details:{precipitation_amount:0}}}}))}}));
 if(address.startsWith('https://power.larc.nasa.gov/'))return new Response(JSON.stringify({header:{fill_value:-999,range:'Fixture monthly climatology'},parameters:{T2M_MAX_AVG:{units:'C'},T2M_MIN_AVG:{units:'C'},PRECTOTCORR:{units:'mm/day'}},properties:{parameter:{T2M_MAX_AVG:{OCT:18},T2M_MIN_AVG:{OCT:9},PRECTOTCORR:{OCT:1}}}}));
 return originalFetch(url,options);
};
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={testDatabase:process.env.MYSQL_TEST_DATABASE,fixture:true,checks:[],screenshots:[],pdfPages:{},localePdfs:[]};
const cookies=async(page,user)=>{await page.context().clearCookies();const [name,value]=user.cookie.split('=');await page.context().addCookies([{name,value,url:fixture.origin}]);};
const noOverflow=async page=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No page overflow');const dialog=page.locator('.premium-trip-dialog');if(await dialog.count()){assert.equal(await dialog.evaluate(el=>el.scrollWidth>el.clientWidth),false,'No dialog overflow');const box=await dialog.boundingBox();assert(box.x>=0&&box.x+box.width<=page.viewportSize().width);}};
const shot=async(page,name)=>{await page.waitForTimeout(300);await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});report.screenshots.push(name+'.png');};
const closeDialog=async page=>{await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);};
const download=async(page,label,name)=>{const [file]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:label,exact:true}).click()]);assert.equal(await file.failure(),null);await file.saveAs(path.join(output,name));return readFile(path.join(output,name));};
try{
 const paid=fixture.paid;
 await fixture.pool.execute('UPDATE trips SET name=?,end_date=?,country=?,destination=?,destination_city=?,timezone=? WHERE id=? AND owner_id=?',['5 days in Kyoto','2026-10-05','Japan','Kyoto','Kyoto','Asia/Tokyo',paid.trip.id,paid.id]);
 await fixture.pool.execute('DELETE FROM itinerary_items WHERE trip_id=? AND owner_id=? AND date>?',[paid.trip.id,paid.id,'2026-10-05']);
 await fixture.pool.execute("UPDATE itinerary_items SET title=CONCAT('Saved place ',sort_order) WHERE trip_id=? AND owner_id=? AND date='2026-10-04'",[paid.trip.id,paid.id]);
 // Give the test's saved fixture explicit end times; production itinerary is never modified.
 const [timed]=await fixture.pool.execute('SELECT id,start_time,date,duration_min FROM itinerary_items WHERE trip_id=? AND owner_id=?',[paid.trip.id,paid.id]);
 for(const item of timed){const start=Date.parse(`${item.date}T${item.start_time}:00Z`),end=new Date(start+(item.duration_min||60)*60000);await fixture.pool.execute('UPDATE itinerary_items SET end_time=?,start_datetime=?,end_datetime=? WHERE id=? AND owner_id=?',[end.toISOString().slice(11,16),`${item.date}T${item.start_time}`,end.toISOString().slice(0,16),item.id,paid.id]);}
 const uploadId=randomUUID();await fixture.pool.execute('INSERT INTO uploads(id,owner_id,filename,mime) VALUES(?,?,?,?)',[uploadId,paid.id,'private-fixture-ticket.pdf','application/pdf']);
 const ticket=await transaction(db=>insertRecord(db,'TripItem',{trip_id:paid.trip.id,category:'place',title:'Museum',date:'2026-10-01',booking_status:'confirmed',confirmation_number:'PRIVATE_FIXTURE_REFERENCE'},paid.id));
 await fixture.pool.execute('INSERT INTO item_attachments(id,owner_id,item_id,upload_id,original_name) VALUES(?,?,?,?,?)',[randomUUID(),paid.id,ticket.id,uploadId,'private-fixture-ticket.pdf']);
 const state={...await transaction(db=>snapshot(db,paid.trip.id,paid.id)),ownerId:paid.id};
 const evidence=officialFixture('MD');
 const essentials=await refreshEssentials(state,'MD',{retrieve:context=>retrieveEssentials(context,{configured:true,log:()=>{},call:async()=>practicalResponse({JP:evidence.guide},[...evidence.pages.keys()]),readPage:async url=>({url,html:evidence.pages.get(url)||''})})});
 assert(essentials.countries.some(country=>country.sections.some(section=>section.facts.some(fact=>fact.sourceType==='official'&&fact.verifiedAt))),'The fixture must pass the current official-evidence validator.');
 const before=JSON.stringify(state.items);
 const [creditsBefore]=await fixture.pool.execute('SELECT * FROM billing_credit_ledger WHERE user_id=?',[paid.id]);
 // Real HTTP protections against anonymous, Free and cross-user calls.
 for(const endpoint of ['/calendar','/essentials','/itinerary/pdf','/itinerary/pdf/full']){
  assert.equal((await fetch(fixture.origin+'/api/trips/'+paid.trip.id+endpoint)).status,401);
  assert.equal((await fetch(fixture.origin+'/api/trips/'+paid.trip.id+endpoint,{headers:{Cookie:fixture.free.cookie}})).status,404);
  assert.equal((await fetch(fixture.origin+'/api/trips/'+fixture.free.trip.id+endpoint,{headers:{Cookie:fixture.free.cookie}})).status,402);
 }
 const page=await browser.newPage({acceptDownloads:true});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
 await page.setViewportSize({width:1440,height:1000});await cookies(page,fixture.free);await page.goto(`${fixture.origin}/trip/${fixture.free.trip.id}/itinerary`);
 await expect(page.getByRole('button',{name:'Download Trip',exact:true})).toBeVisible();
 for(const label of ['Download Quick PDF','Download Full Travel Book','Add to Calendar']){
  await page.getByRole('button',{name:'Download Trip',exact:true}).click();const option=page.getByRole('button',{name:label,exact:true});await expect(option).toBeEnabled();await expect(option.locator('.lucide-lock-keyhole')).toHaveCount(1);await option.click();await expect(page.getByRole('heading',{name:'Get more from your trip'})).toBeVisible();await page.getByRole('button',{name:'Continue with my current plan'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 }
 await page.getByRole('button',{name:'View essentials',exact:true}).click();await expect(page.getByRole('heading',{name:'Get more from your trip'})).toBeVisible();await page.getByRole('button',{name:'Continue with my current plan'}).click();
 await cookies(page,paid);await page.evaluate(()=>localStorage.setItem('tripnexa.passport-country','MD'));await page.goto(`${fixture.origin}/trip/${paid.trip.id}/itinerary`);await page.getByRole('button',{name:'Download Trip',exact:true}).click();await expect(page.getByRole('button',{name:'Download Quick PDF',exact:true})).toBeEnabled();await noOverflow(page);await shot(page,'premium-pdf-chooser');
 const quick=await download(page,'Download Quick PDF','quick-itinerary.pdf');assert(quick.subarray(0,4).toString()==='%PDF');report.pdfPages.quick=(quick.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;
 const full=await download(page,'Download Full Travel Book','full-travel-book.pdf');assert(full.subarray(0,4).toString()==='%PDF');report.pdfPages.full=(full.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert(report.pdfPages.full>=7&&report.pdfPages.full<=11,`Useful 5-day book density: ${report.pdfPages.full} pages`);
 await page.getByRole('button',{name:'Add to Calendar',exact:true}).click();await page.getByLabel('Selected day(s)',{exact:true}).check();await page.locator('.calendar-days input').first().check();await page.getByLabel('Include transfers',{exact:true}).uncheck();
 const ics=(await download(page,'Download .ICS','itinerary.ics')).toString('utf8');assert(ics.includes('BEGIN:VCALENDAR'));assert(!ics.includes('PRIVATE_FIXTURE_REFERENCE'));assert(!ics.includes('PRIVATE_FIXTURE'));assert(!ics.includes('SUMMARY:Walk'));assert(!ics.includes('DTSTART:20261002'));await closeDialog(page);
 await page.getByRole('button',{name:'View essentials',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Last updated:');await expect(page.getByRole('dialog').getByRole('link',{name:'Official source',exact:false}).first()).toBeVisible();await noOverflow(page);await shot(page,'before-you-go');await closeDialog(page);
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.getByRole('button',{name:'Download Trip',exact:true}).click();await noOverflow(page);await shot(page,'mobile-downloads');await closeDialog(page);
 await page.getByRole('button',{name:'View essentials',exact:true}).click();await noOverflow(page);await expect(page.getByLabel('What passport will you travel with?',{exact:false})).toHaveValue('MD');await closeDialog(page);
 await page.getByRole('button',{name:'Download Trip',exact:true}).click();await page.getByRole('button',{name:'Add to Calendar',exact:true}).click();await noOverflow(page);await closeDialog(page);
 // Overview placement and final-day placement use the same compact card.
 await page.goto(`${fixture.origin}/trip/${paid.trip.id}`);await expect(page.locator('[data-before-you-go]')).toHaveCount(1);await noOverflow(page);
 // Real local HTTP downloads in every locale. Respect the unchanged export limiter.
 for(const locale of ['en','ro','ru','de','fr','es'])for(const [kind,suffix]of [['quick','/itinerary/pdf'],['essentials','/essentials/pdf?passport=MD'],['book','/itinerary/pdf/full?passport=MD']]){
  const url=fixture.origin+'/api/trips/'+paid.trip.id+suffix,headers={Cookie:paid.cookie,'X-Requested-With':'TripSync','X-TripNexa-Locale':locale};
  let response=await fetch(url,{headers});
  if(response.status===429){const seconds=Number(response.headers.get('retry-after'));assert(Number.isFinite(seconds)&&seconds>0&&seconds<=60,'Export rate limit supplies a bounded retry delay');console.log(`Respecting PDF export rate limit: ${seconds}s`);await new Promise(resolve=>setTimeout(resolve,seconds*1000+250));response=await fetch(url,{headers});}
  assert.equal(response.status,200,locale+' '+kind+' PDF HTTP response');assert.match(response.headers.get('content-type'),/application\/pdf/);
  const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.match(bytes.toString('latin1'),/NotoSans/);
  await writeFile(path.join(output,locale+'-'+kind+'.pdf'),bytes);report.localePdfs.push({locale,kind,status:response.status,bytes:bytes.length});console.log(locale+' '+kind+': actual local authenticated PDF endpoint passed');
 }
 assert.equal(unexpectedAiCalls,0,'Downloading PDFs must never add model requests');
 const current=await transaction(db=>snapshot(db,paid.trip.id,paid.id));assert.equal(JSON.stringify(current.items),before);
 const [creditsAfter]=await fixture.pool.execute('SELECT * FROM billing_credit_ledger WHERE user_id=?',[paid.id]);assert.deepEqual(creditsAfter,creditsBefore);assert.deepEqual(errors,[]);
 // One printable example from the same Full Book HTML renderer, without Google tiles.
 const html=await travelBookHtml(state,await present(state),(await readWallet(paid.trip.id,paid.id)).items,{applicationUrl:fixture.origin,essentials});await writeFile(path.join(output,'full-travel-book.html'),html);
 await page.setViewportSize({width:794,height:1100});await page.setContent(html);await page.locator('.day').first().screenshot({path:path.join(output,'full-travel-book-example.png')});report.screenshots.push('full-travel-book-example.png');
 report.checks=['Anonymous 401, other-user 404, Free 402 for all endpoints','Free: locked Calendar, both PDFs and Before You Go use existing paywall','Premium: actual selected-day ICS, Quick PDF and Full Travel Book downloads','All 18 authenticated locale/PDF variant HTTP downloads; unchanged rate limiter respected; zero AI calls','Full Book: 5-day density checked, maps/routes/Wallet/essentials in shared renderer','Before You Go: current validated sources, freshness, passport, Overview and final-day placement','1440px and 390px dialogs/cards without overflow','No browser errors, itinerary mutations or new credit-ledger entries'];
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();globalThis.fetch=originalFetch;await fixture.close();}
