import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium,expect} from '../website/node_modules/@playwright/test/index.mjs';
import {config} from '../server/config.js';
import {pool} from '../server/db.js';
import {createStaticMapProvider} from '../server/premium-travel/static-map-provider.js';
import {travelBookHtml,renderTravelBook} from '../server/premium-travel/travel-book.js';
import {fixtureMapPng} from '../server/tests/pdf-map-fixture.mjs';

// Default validation is offline: no MySQL queries, API charges or live imagery.
// After configuring a real key, --live validates and saves the real geographic PDF.
const live=process.argv.includes('--live');
if(live)assert(config.pdfStaticMapKey,'Configure GEOAPIFY_PDF_MAPS_API_KEY before --live.');
const output=path.resolve('.local/static-map-pdf');await mkdir(output,{recursive:true});
const dates=['2026-10-07','2026-10-08'],items=[];
for(const [index,date]of dates.entries()){
 items.push({id:`route-${index}`,date,step_type:'transport',title:'Hotel to Museum',start_time:'09:00',end_time:'09:20',route_origin:'Hotel, Kyoto',route_destination:'Museum, Kyoto',route_mode:'walk',route_duration_min:20});
 for(const [number,name,position]of [[1,'Museum',{lat:35.008,lng:135.771}],[2,'Unmapped temple',{}],[3,'Garden',{lat:35.012,lng:135.754}]])items.push({id:`visit-${index}-${number}`,date,step_type:'visit',title:name,...(number===1?{location:'Museum, Kyoto'}:{}),...position,start_time:`${9+number}:00`,end_time:`${10+number}:00`});
}
const state={trip:{id:'pdf-validation',name:'Kyoto PDF map validation',destination:'Kyoto',country:'Japan',start_date:dates[0],end_date:dates[1]},tripItems:[{category:'stay',title:'Hotel',address:'Hotel, Kyoto',lat:35.002,lng:135.765}],places:[]},plan={dates,items};
let requests=0,browser;
const png=fixtureMapPng(1200,440),options={applicationUrl:'https://tripnexa.app'},cacheDirectory=live?config.pdfStaticMapCacheDir:await mkdtemp(path.join(output,'cache-validation-'));
const providerOptions={ownerId:'isolated-pdf-validation',tripId:state.trip.id,cacheDirectory,...(live?{}:{apiKey:'offline-validation-placeholder',fetchImpl:async()=>{requests++;return new Response(png,{headers:{'content-type':'image/png'}});}})},provider=()=>createStaticMapProvider(providerOptions);
try{
 const html=await travelBookHtml(state,plan,[],{...options,basemapProvider:provider()}),bytes=await renderTravelBook(state,plan,[],{...options,basemapProvider:provider()}),raw=bytes.toString('latin1');
 assert(raw.startsWith('%PDF'));assert(/\/Subtype \/Image\s*\/Width 1200\s*\/Height 440/.test(raw),'True-resolution provider PNG is embedded in the PDF');assert(raw.includes('https://www.google.com/maps/dir/'));assert(raw.includes('https://www.geoapify.com/'));assert(raw.includes('https://openmaptiles.org/'));assert(raw.includes('https://www.openstreetmap.org/copyright'));assert(!html.includes('offline-validation-placeholder'));assert(!html.includes('maps.googleapis.com'));assert(!html.includes('Schematic map'));
 if(!live)assert.equal(requests,2,'First export generates once per day; a new provider for the PDF reuses disk cache');
 const repeated=await renderTravelBook(state,plan,[],{...options,basemapProvider:provider()});assert(repeated.toString('latin1').startsWith('%PDF'));if(!live)assert.equal(requests,2,'Repeated download makes zero additional requests');await writeFile(path.join(output,'repeated-download.pdf'),repeated);
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:794,height:1100}});await page.route('https://**/*',route=>route.abort());await page.setContent(html);
 assert.equal(await page.locator('.day-map image').count(),2);assert.equal(await page.locator('svg.qr').count(),2);assert.equal(await page.locator('.unmapped-stops').count(),2);
 for(const day of await page.locator('.day').all()){
  await expect(day.locator('.map-attribution')).toContainText('Powered by Geoapify');await expect(day.locator('.map-attribution')).toContainText('OpenMapTiles');await expect(day.locator('.map-attribution')).toContainText('OpenStreetMap contributors');await expect(day.locator('.unmapped-stops')).toContainText('Unmapped temple');
  const markers=await day.locator('.pdf-stop text').allTextContents();assert(markers.includes('H'));assert(markers.includes('1'));assert(markers.includes('3'));assert(!markers.includes('2'));
  assert.equal(await day.locator('.live-route').evaluate(element=>getComputedStyle(element).breakInside),'avoid');
 }
 const embedded=await page.locator('.day-map image').first().getAttribute('href');assert.deepEqual(await page.evaluate(async dataUrl=>{const image=new Image();image.src=dataUrl;await image.decode();return [image.width,image.height];},embedded),[1200,440]);
 const prefix=live?'geographic-live':'provider-fixture';await writeFile(path.join(output,prefix+'.pdf'),bytes);await writeFile(path.join(output,prefix+'.html'),html);await page.locator('.day').first().screenshot({path:path.join(output,prefix+'.png')});
 let failures=0;const fallbackProvider=()=>createStaticMapProvider({apiKey:'offline-validation-placeholder',ownerId:'isolated-pdf-validation',tripId:state.trip.id+'-outage',cacheDirectory,fetchImpl:async()=>{failures++;return new Response('Offline outage',{status:503});}});
 const fallback=await travelBookHtml(state,plan,[],{...options,basemapProvider:fallbackProvider()}),fallbackBytes=await renderTravelBook(state,plan,[],{...options,basemapProvider:fallbackProvider()});assert(fallback.includes('Schematic map'));assert(!fallback.includes('<image'));assert(fallbackBytes.toString('latin1').startsWith('%PDF'));assert.equal(failures,2,'Failure cooldown prevents repeated requests for both days');await writeFile(path.join(output,'emergency-fallback.pdf'),fallbackBytes);
 const report={mode:live?'real Geoapify service':'offline provider-response fixture; grid image is test data only, not the final basemap',configured:Boolean(config.pdfStaticMapKey),checks:['1200x440 PNG embedded in actual Full Travel Book PDF','H and numbered real-coordinate stops; missing coordinates listed below','Visible and clickable Geoapify, OpenMapTiles and OSM attribution','Two live Google route QR codes/links; no Google imagery','No API key embedded in HTML/PDF','Fresh export instances reuse persistent day-map cache with zero repeated requests','External outage produces emergency fallback PDF; five-minute failure cache avoids repeated requests'],mockedSuccessfulRequests:live?null:requests,mockedFailedRequests:failures,pdfPages:(raw.match(/\/Type \/Page\b/g)||[]).length,artifacts:[prefix+'.pdf',prefix+'.png','repeated-download.pdf','emergency-fallback.pdf']};await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await pool.end();}
