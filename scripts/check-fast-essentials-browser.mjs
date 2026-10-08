import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '../website/node_modules/@playwright/test/index.mjs';
import {mapFixture} from '../server/tests/interactive-maps-fixture.mjs';
import {guideCall,practicalResponse,officialFixture} from '../server/tests/essentials-fast-fixture.mjs';
assert.match(process.env.MYSQL_TEST_DATABASE||'',/_test$/,'Use an isolated test database.');
const output=path.resolve('.local/universal-essentials');await mkdir(output,{recursive:true});
const fixture=await mapFixture(),originalFetch=globalThis.fetch,requests=[];
const {config}=await import('../server/config.js');
const {snapshot,present}=await import('../server/itinerary-service.js'),{transaction}=await import('../server/db.js');
const {savedEssentials,essentialsContext,essentialsHash}=await import('../server/premium-travel/essentials.js');
const {verifyBriefEvidence}=await import('../server/premium-travel/essentials-provider.js');
const {travelBookHtml}=await import('../server/premium-travel/travel-book.js');
const {essentialsPdfHtml}=await import('../server/premium-travel/essentials-pdf.js');
const {insertRecord}=await import('../server/entities.js');
config.aiKey='offline-essentials-fixture';config.aiModel='fixture-model';config.pdfStaticMapKey='';
const realNow=Date.now;
globalThis.fetch=async(url,options)=>{
 const address=String(url);
 if(address==='https://api.openai.com/v1/responses'){
  const body=JSON.parse(options.body);requests.push(body);await new Promise(resolve=>setTimeout(resolve,700));
  assert.deepEqual(body.tools,[{type:'web_search',search_context_size:'low'}]);assert.equal(body.max_tool_calls,2);
  return new Response(JSON.stringify(await guideCall('responses',body)),{headers:{'Content-Type':'application/json'}});
 }
 if(address.startsWith(fixture.origin+'/'))return originalFetch(url,options);
 throw Error('Live external requests are disabled in this fixture.');
};
let browser;
try{
 const paid=fixture.paidSingle;
 await fixture.pool.execute('UPDATE trips SET name=?,destination=?,country=?,currency=?,timezone=?,start_date=?,end_date=? WHERE id=? AND owner_id=?',['Kyoto universal brief','Kyoto','Japan','JPY','Asia/Tokyo','2026-10-06','2026-10-09',paid.trip.id,paid.id]);
 await fixture.pool.execute('UPDATE itinerary_items SET date=? WHERE trip_id=? AND owner_id=?',['2026-10-06',paid.trip.id,paid.id]);
 await transaction(db=>insertRecord(db,'TripItem',{trip_id:paid.trip.id,category:'flight',title:'Offline arriving flight',departure_airport:'RMO',arrival_airport:'KIX',departure_datetime:'2026-10-05T20:00',arrival_datetime:'2026-10-06T08:00',departure_timezone:'Europe/Chisinau',arrival_timezone:'Asia/Tokyo'},paid.id,{internal:true}));
 const attraction=await transaction(db=>insertRecord(db,'PlaceSelection',{trip_id:paid.trip.id,name:'Fushimi Inari',city:'Kyoto',country:'Japan',priority:'mandatory'},paid.id,{internal:true}));
 await fixture.pool.execute('UPDATE itinerary_items SET selection_id=? WHERE id=? AND owner_id=?',[attraction.id,paid.items.find(item=>item.step_type==='visit').id,paid.id]);
 const state={...await transaction(db=>snapshot(db,paid.trip.id,paid.id)),ownerId:paid.id},itemsBefore=JSON.stringify(state.items);
 const creditSql='SELECT (SELECT COUNT(*) FROM billing_credit_ledger WHERE user_id=?) AS ledger,(SELECT COALESCE(SUM(remaining),0) FROM billing_credit_lots WHERE user_id=?) AS remaining';
 const [[creditsBefore]]=await fixture.pool.execute(creditSql,[paid.id,paid.id]);
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**/*',route=>route.abort());
 page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/essentials/refresh'))posts.push(request.postDataJSON().passport);});
 const [name,value]=paid.cookie.split('=');await page.context().addCookies([{name,value,url:fixture.origin}]);
 await page.goto(fixture.origin);await page.evaluate(()=>localStorage.removeItem('tripnexa.passport-country'));await page.goto(`${fixture.origin}/trip/${paid.trip.id}`);
 const selector=page.locator('.passport-country select'),dialog=page.getByRole('dialog');
 const section=title=>page.locator('.essentials-sections details').filter({has:page.locator('summary',{hasText:title})});
 const open=async()=>{await page.getByRole('button',{name:'View essentials',exact:true}).click();await expect(selector).toBeVisible();};
 const noOverflow=async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('.premium-trip-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);};
 const capture=async(name,width)=>{
  await page.setViewportSize({width,height:width===390?844:1000});await noOverflow();await page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
  const modal=page.locator('.premium-trip-dialog'),style=await modal.getAttribute('style');
  try{await modal.evaluate(el=>{el.style.maxHeight='none';el.style.position='absolute';el.style.top='12px';el.style.transform='translateX(-50%)';el.style.overflow='visible';});await modal.screenshot({path:path.join(output,name+'-guide.png'),animations:'disabled'});}
  finally{await modal.evaluate((el,style)=>{if(style===null)el.removeAttribute('style');else el.setAttribute('style',style);},style);}
 };
 await open();await expect(section('Entry & documents')).toContainText('Choose your passport country');assert.equal(requests.length,0);
 await selector.selectOption('MD');await expect(selector).toBeDisabled();await expect(page.locator('.essentials-loading')).toHaveText('Preparing your travel essentials…');
 await expect(page.locator('.essentials-spinner')).toBeVisible();await selector.evaluate(el=>{el.dispatchEvent(new Event('change',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
 await expect(selector).toBeEnabled();assert.equal(requests.length,1);assert.deepEqual(posts,['MD']);assert.equal(await page.evaluate(()=>localStorage.getItem('tripnexa.passport-country')),'MD');
 for(const [title,value]of [['Power & plugs','100V'],['Power & plugs','60Hz'],['Connectivity / SIM / eSIM','four-day Kyoto'],['Getting around','ICOCA'],['Local customs & etiquette','chopsticks'],['Useful phrases','こんにちは'],['Time & time difference','JST'],['Time & time difference','6 hours ahead of Moldova'],['Time & time difference','15:00']])await expect(section(title)).toContainText(value);
 assert.equal(await page.locator('.essentials-sections details').count(),10);assert.equal(await page.locator('.essentials-section-unavailable').count(),0);
 await expect(dialog).not.toContainText("We couldn't prepare this section yet.");await expect(section('Entry & documents')).not.toContainText('90 days');await expect(section('Emergency numbers')).not.toContainText('119');
 assert.equal(await page.locator('.essentials-about').count(),1);assert.equal(await page.locator('.essentials-travel-notice').count(),0);assert.equal(await section('Health & safety').count(),0);
 // Validate same-request critical evidence offline, then use that saved JSON for cached UI/PDF provenance checks.
 // No additional AI call: these are simulated pages, not current Japan entry advice.
 const sourceFixture=officialFixture('MD'),context=essentialsContext(state,'MD');
 const checked=await verifyBriefEvidence(context,{JP:sourceFixture.guide},practicalResponse({JP:sourceFixture.guide},[...sourceFixture.pages.keys()]),{readPage:async url=>({url,html:sourceFixture.pages.get(url)})});
 const saved=await savedEssentials(state,'MD');
 for(const verified of checked.countries[0].sections){const target=saved.countries[0].sections.find(section=>section.key===verified.key);target.facts=verified.key==='customs'?[...target.facts,...verified.facts]:verified.facts;}
 saved.verification={status:'complete'};saved.countries[0].checkedAt=new Date().toISOString();
 await fixture.pool.execute('UPDATE trip_essentials_snapshots SET snapshot=? WHERE trip_id=? AND owner_id=? AND context_hash=?',[JSON.stringify(saved),paid.trip.id,paid.id,essentialsHash(context)]);
 await page.keyboard.press('Escape');await open();await expect(selector).toHaveValue('MD');assert.equal(requests.length,1);
 await expect(section('Entry & documents').locator('.essentials-verified')).toHaveText('✓ Verified');await expect(section('Entry & documents').getByRole('link',{name:'Official source'})).toHaveAttribute('href',[...sourceFixture.pages.keys()][0]);
 await expect(section('Emergency numbers')).toContainText('Police 110');await expect(page.locator('.essentials-travel-notice')).toContainText('severe storm');
 await capture('desktop',1440);await capture('mobile',390);
 const beforePdf=requests.length,downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download Essentials PDF',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Download Essentials PDF',exact:true}).click();await (await downloadPromise).saveAs(path.join(output,'before-you-go.pdf'));await expect(page.locator('.essentials-spinner')).toHaveCount(0);
 const pdfResponse=await originalFetch(`${fixture.origin}/api/trips/${paid.trip.id}/essentials/pdf?passport=MD`,{headers:{Cookie:paid.cookie}});assert.equal(pdfResponse.status,200);
 const bytes=Buffer.from(await pdfResponse.arrayBuffer()),raw=bytes.toString('latin1'),pages=(raw.match(/\/Type \/Page\b/g)||[]).length;assert(pages>=2&&pages<=4,`Compact PDF: ${pages} pages`);assert(raw.includes([...sourceFixture.pages.keys()][0]));
 const shared=await savedEssentials(state,'MD'),pdfHtml=essentialsPdfHtml(state.trip,shared),plan=await present(state),bookHtml=await travelBookHtml(state,plan,[],{applicationUrl:fixture.origin,essentials:shared});
 for(const value of ['100V','ICOCA','chopsticks','こんにちは','✓ Verified','Official source','Official authorities & sources','About this information']){assert(pdfHtml.includes(value),value);assert(bookHtml.includes(value),value);}
 await writeFile(path.join(output,'before-you-go.html'),pdfHtml);
 const full=await originalFetch(`${fixture.origin}/api/trips/${paid.trip.id}/itinerary/pdf/full?passport=MD`,{headers:{Cookie:paid.cookie}});assert.equal(full.status,200);await writeFile(path.join(output,'full-book-reuse.pdf'),Buffer.from(await full.arrayBuffer()));assert.equal(requests.length,beforePdf);
 assert.equal((await originalFetch(`${fixture.origin}/api/trips/${fixture.free.trip.id}/essentials/pdf?passport=MD`,{headers:{Cookie:fixture.free.cookie}})).status,402);
 assert.equal((await originalFetch(`${fixture.origin}/api/trips/${paid.trip.id}/essentials/pdf?passport=MD`,{headers:{Cookie:fixture.free.cookie}})).status,404);
 assert.equal((await originalFetch(`${fixture.origin}/api/trips/${paid.trip.id}/essentials/pdf?passport=MD`)).status,401);
 // Manual fresh update uses one model call and retains cards throughout its loading state.
 let held;const updateUrl='**/api/trips/*/essentials/refresh';await page.route(updateUrl,route=>{held=route;});Date.now=()=>realNow()+300001;
 await page.getByRole('button',{name:'Update information',exact:true}).click();await expect.poll(()=>Boolean(held)).toBe(true);await expect(selector).toBeDisabled();await expect(section('Power & plugs')).toContainText('100V');await expect(page.locator('.essentials-loading')).toContainText('Your previous guide stays visible');
 await page.locator('.essentials-loading').scrollIntoViewIfNeeded();await noOverflow();await page.screenshot({path:path.join(output,'loading-mobile.png'),animations:'allow'});
 await page.setViewportSize({width:1440,height:1000});await page.locator('.essentials-loading').scrollIntoViewIfNeeded();await noOverflow();await page.screenshot({path:path.join(output,'loading-desktop.png'),animations:'allow'});
 const transform=await page.locator('.essentials-spinner').evaluate(el=>getComputedStyle(el).transform);await expect.poll(()=>page.locator('.essentials-spinner').evaluate(el=>getComputedStyle(el).transform)).not.toBe(transform);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.essentials-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 await held.fulfill({response:await held.fetch()});await expect(selector).toBeEnabled();await expect(page.locator('.essentials-spinner')).toHaveCount(0);assert.equal(requests.length,2);
 await page.unroute(updateUrl);await page.getByRole('button',{name:'Update information',exact:true}).click();await expect(dialog).toContainText('already up to date');assert.equal(requests.length,2);
 // Unrelated stale cached MD response cannot overwrite an explicit Romanian selection.
 await page.keyboard.press('Escape');let delayed;await page.route('**/api/trips/*/essentials?passport=MD',route=>{delayed=route;});await open();await expect.poll(()=>Boolean(delayed)).toBe(true);
 await selector.selectOption('RO');await expect(selector).toBeDisabled();await expect(selector).toBeEnabled();assert.equal(requests.length,3);
 await delayed.fulfill({status:200,contentType:'application/json',body:JSON.stringify(shared)});await expect(selector).toHaveValue('RO');await expect(section('Entry & documents')).not.toContainText('Moldovan passport holders');await page.unroute('**/api/trips/*/essentials?passport=MD');
 await expect(section('Getting around')).toContainText('Fushimi Inari');await expect(section('Useful phrases')).toContainText('こんにちは');await expect(section('Emergency numbers')).not.toContainText('119');assert.equal(await page.locator('.essentials-travel-notice').count(),0);
 await capture('romania-desktop',1440);await capture('romania-mobile',390);
 const roPdf=await originalFetch(`${fixture.origin}/api/trips/${paid.trip.id}/essentials/pdf?passport=RO`,{headers:{Cookie:paid.cookie}});assert.equal(roPdf.status,200);await writeFile(path.join(output,'romania-before-you-go.pdf'),Buffer.from(await roPdf.arrayBuffer()));assert.equal(requests.length,3);
 await selector.selectOption('');await expect(section('Entry & documents')).toContainText('Choose your passport country');assert.equal(requests.length,3);assert.equal(await page.evaluate(()=>localStorage.getItem('tripnexa.passport-country')),null);
 await noOverflow();await page.keyboard.press('Escape');await open();assert.equal(requests.length,3);
 const after=await transaction(db=>snapshot(db,paid.trip.id,paid.id));assert.equal(JSON.stringify(after.items),itemsBefore);const [[creditsAfter]]=await fixture.pool.execute(creditSql,[paid.id,paid.id]);assert.deepEqual(creditsAfter,creditsBefore);assert.deepEqual(errors,[]);
 const report={fixture:true,liveProviderCalls:0,primaryModelCalls:3,repairCalls:0,supplementalModelCalls:0,refreshPosts:posts,pdfPages:pages,viewports:[1440,390],checks:['Romanian/Moldovan Kyoto guide: destination-specific useful content and local-script phrases','One primary per fresh update; none for cooldown/open/restore/clear/PDF','Current official fixture evidence is locally validated, then restored from the saved snapshot','Unverified visa/emergency absent; optional notice present/absent','Coral animated/static reduced-motion spinner; retained cards; duplicate/stale-read guards','Both actual PDFs reuse snapshots; verified clickable sources; 2–4-page Essentials PDF','No horizontal overflow/browser errors; ownership/premium/credits/itinerary preserved']};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{Date.now=realNow;if(browser)await browser.close();globalThis.fetch=originalFetch;await fixture.close();}
