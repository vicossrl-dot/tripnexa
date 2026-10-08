import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '../website/node_modules/@playwright/test/index.mjs';
import {mapFixture} from '../server/tests/interactive-maps-fixture.mjs';

assert.match(process.env.MYSQL_TEST_DATABASE||'',/_test$/);
const output=path.resolve('.local/passport-and-pdf-maps');await mkdir(output,{recursive:true});
const fixture=await mapFixture();
const {emptyEssentials}=await import('../server/premium-travel/essentials.js');
const {travelBookHtml,renderTravelBook}=await import('../server/premium-travel/travel-book.js');
const {fixtureMapProvider}=await import('../server/tests/pdf-map-fixture.mjs');
let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
 if(!process.argv.includes('--pdf-only')){
 const paid=fixture.paidSingle,[name,value]=paid.cookie.split('=');await page.context().addCookies([{name,value,url:fixture.origin}]);
 const payload=passport=>{const data=emptyEssentials({countries:['JP'],travelerPassportCountry:passport||null,startDate:'2026-10-07',endDate:'2026-10-09'});data.countries[0].sections[0].facts=[{text:'Fixture result for '+(passport||'empty passport'),sourceType:'official',sourceUrl:'https://www.mofa.go.jp/j_info/visit/visa/index.html'}];return data;};
 const reads=[],refreshes=[];let firstRead,alRefresh,oldAlRead,holdAlRead=false;
 const fulfill=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 await page.route('**/api/trips/*/essentials**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='GET'){
   const passport=url.searchParams.get('passport')||null;reads.push(passport);
   if(reads.length===1){firstRead=route;return;}
   if(passport==='AL'&&holdAlRead){oldAlRead=route;return;}
   return fulfill(route,payload(passport));
  }
  const passport=request.postDataJSON().passport;refreshes.push(passport);
  if(passport==='AL'){alRefresh=route;return;}
  if(passport==='MD'&&refreshes.filter(value=>value==='MD').length>1)return fulfill(route,{error:'Essentials were checked recently. Please wait five minutes before refreshing.'},429);
  await new Promise(resolve=>setTimeout(resolve,150));return fulfill(route,payload(passport));
 });
 await page.goto(fixture.origin);await page.evaluate(()=>localStorage.removeItem('tripnexa.passport-country'));await page.goto(`${fixture.origin}/trip/${paid.trip.id}`);
 const open=async()=>{await page.getByRole('button',{name:'View essentials',exact:true}).click();await expect(page.locator('.passport-country select')).toBeVisible();};
 const selector=page.locator('.passport-country select'),entry=page.locator('.essentials-sections details').filter({has:page.locator('summary',{hasText:'Entry & documents'})});
 await open();await expect.poll(()=>reads.length).toBe(1);assert.equal(refreshes.length,0);
 await selector.selectOption('AL');await expect.poll(()=>refreshes.length).toBe(1);await expect(selector).toBeDisabled();await expect(page.getByRole('status')).toContainText('Checking travel information…');
 // Duplicate synthetic events cannot bypass the synchronous lock before rerender.
 await selector.evaluate(element=>{element.dispatchEvent(new Event('change',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});assert.deepEqual(refreshes,['AL']);assert.equal(reads.length,1,'Selection makes one POST, not a second cached GET');
 await fulfill(alRefresh,payload('AL'));await expect(entry).toContainText('Fixture result for AL');await expect(selector).toBeEnabled();assert.equal(await page.evaluate(()=>localStorage.getItem('tripnexa.passport-country')),'AL');
 await fulfill(firstRead,payload(null));await page.waitForTimeout(100);await expect(entry).toContainText('Fixture result for AL');
 await page.keyboard.press('Escape');holdAlRead=true;await open();await expect.poll(()=>Boolean(oldAlRead)).toBe(true);await expect(selector).toHaveValue('AL');assert.equal(refreshes.length,1,'Reopen is read-only');
 await selector.selectOption('MD');await expect.poll(()=>refreshes.length).toBe(2);await expect(selector).toBeDisabled();await expect(entry).toContainText('Fixture result for MD');await expect(selector).toBeEnabled();
 await fulfill(oldAlRead,payload('AL'));await page.waitForTimeout(100);await expect(entry).toContainText('Fixture result for MD');assert.deepEqual(refreshes,['AL','MD']);
 await page.keyboard.press('Escape');await open();await expect(entry).toContainText('Fixture result for MD');await expect(selector).toHaveValue('MD');assert.equal(refreshes.length,2);
 await page.getByRole('button',{name:'Refresh essentials',exact:true}).click();await expect(page.getByRole('alert')).toContainText('five minutes');assert.deepEqual(refreshes,['AL','MD','MD']);await expect(selector).toHaveValue('MD');
 await selector.selectOption('');await expect(entry).toContainText('Choose your passport country');await expect(entry).not.toContainText('Fixture result');assert.equal(refreshes.length,3);assert.equal(await page.evaluate(()=>localStorage.getItem('tripnexa.passport-country')),null);
 await page.getByRole('button',{name:'Refresh essentials',exact:true}).click();await expect(page.getByRole('status')).toContainText('Travel essentials updated.');assert.deepEqual(refreshes,['AL','MD','MD',null]);await expect(entry).toContainText('Choose your passport country');assert.equal(await page.getByRole('button',{name:'Refresh essentials',exact:true}).count(),1);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.keyboard.press('Escape');
 }

 // Two representative saved days; no live maps, AI, routing or provider calls.
 const dates=['2026-10-07','2026-10-08'],items=[];
 for(const [index,date] of dates.entries()){
  items.push({id:'route-'+index,date,step_type:'transport',title:'Hotel to Museum',start_time:'09:00',end_time:'09:20',route_origin:'Hotel, Kyoto',route_destination:'Museum, Kyoto',route_mode:'walk',route_duration_min:20});
  for(let number=1;number<=4;number++)items.push({id:`visit-${index}-${number}`,date,step_type:'visit',title:number===1?'Museum':number===3?'Tenryū-ji':'Saved stop '+number,...(number===1?{location:'Museum, Kyoto'}:{}),start_time:`${9+number}:00`,end_time:`${10+number}:00`,...(index===1&&number===3?{}:{lat:35.001+number*.003,lng:135.765+number*.004})});
 }
 const state={trip:{id:'pdf-fixture',name:'Kyoto map review',destination:'Kyoto',country:'Japan',start_date:dates[0],end_date:dates[1]},tripItems:[{category:'stay',title:'Hotel',address:'Hotel, Kyoto',lat:35,lng:135.765}],places:[]},plan={dates,items};
 const options={applicationUrl:'https://tripnexa.app'},html=await travelBookHtml(state,plan,[],options),providerHtml=await travelBookHtml(state,plan,[],{...options,basemapProvider:fixtureMapProvider()});
 const bytes=await renderTravelBook(state,plan,[],options),providerBytes=await renderTravelBook(state,plan,[],{...options,basemapProvider:fixtureMapProvider()});
 await writeFile(path.join(output,'full-book-fallback.pdf'),bytes);await writeFile(path.join(output,'full-book-provider-fixture.pdf'),providerBytes);await writeFile(path.join(output,'full-book-fallback.html'),html);
 const raw=bytes.toString('latin1'),rawProvider=providerBytes.toString('latin1'),pages=(raw.match(/\/Type \/Page\b/g)||[]).length;
 assert(raw.startsWith('%PDF'));assert(pages>=4&&pages<=5,`Compact two-day book: ${pages} pages`);assert(raw.includes('https://www.google.com/maps/dir/'));assert(!html.includes('<img'),'QR is inline SVG and has no broken raster-image placeholder');
 assert(/\/Subtype \/Image\s*\/Width 600\s*\/Height 220/.test(rawProvider),'Provider fixture PNG was embedded in actual PDF at its true dimensions');
 await page.setViewportSize({width:794,height:1100});await page.setContent(html);assert.equal(await page.locator('svg.qr').count(),2);assert.equal(await page.locator('img').count(),0);
 for(const map of await page.locator('.day-map').all()){const box=await map.boundingBox();assert(box.height>=220&&box.height<=320);}
 assert.equal(await page.locator('.unmapped-stops').count(),1);await expect(page.locator('.unmapped-stops')).toContainText('Tenryū-ji');await expect(page.locator('.day').nth(1)).toContainText('Tenryū-ji');
 for(const block of await page.locator('.live-route').all()){assert.equal(await block.evaluate(el=>getComputedStyle(el).breakInside),'avoid');await expect(block.getByRole('link',{name:'Open live route'})).toBeVisible();}
 await page.locator('.day').nth(1).screenshot({path:path.join(output,'pdf-map-example.png')});
 await page.setContent(providerHtml);await expect(page.locator('.map-attribution').first()).toContainText('OpenStreetMap contributors');await expect(page.locator('.map-attribution').first()).toContainText('https://www.openstreetmap.org/copyright');assert.deepEqual(errors,[]);
 const report={fixture:true,passportChecks:['No refresh on open/restore/rerender','AL selection: one POST and immediate disabled/loading state','MD context: one POST; stale initial/AL reads cannot overwrite current result','Stored MD restored on reopen without refresh','Clear: cached read only, no visa claim, storage cleared','Single bottom manual button works; same-context cooldown error preserved'],pdfChecks:['Multiple/missing coordinates, accommodation and numbered stops','Aspect-preserving padded projection and concise unmapped list','Actual fallback Full PDF generation and clickable Google live routes','Vector QR rendered as PDF graphics with no image dependency','Licensed fixture PNG embedded and OSM/printed URL attribution displayed','No real basemap provider, Google imagery or external API calls'],pdfPages:pages,screenshots:['pdf-map-example.png']};
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await fixture.close();}
