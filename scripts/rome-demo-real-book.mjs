// Demo-only export preparation. No production routes, settings or database writes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createStaticMapProvider} from '../server/premium-travel/static-map-provider.js';
import {mapCacheHash} from '../server/premium-travel/pdf-map-cache.js';
import {fitPdfMapViewport,pdfDayWithAccommodation} from '../server/premium-travel/pdf-day-map.js';
import {buildTripMap} from '../src/lib/interactive-trip-map.js';
import {travelBookHtml} from '../server/premium-travel/travel-book.js';
import {renderPdf} from '../server/itinerary-pdf.js';

const y=lat=>.5-Math.log((1+Math.sin(lat*Math.PI/180))/(1-Math.sin(lat*Math.PI/180)))/(4*Math.PI);
const lat=value=>Math.atan(Math.sinh(Math.PI*(1-2*value)))*180/Math.PI;

export async function prepareRealRomeBook(fixture,out,chromium){
 const {state,plan,wallet,essentials}=fixture;
 const days=buildTripMap({trip:state.trip,items:plan.items,dates:plan.dates,stays:state.tripItems,selections:state.places}).map(day=>pdfDayWithAccommodation(day,state.tripItems));
 const viewports=days.map(fitPdfMapViewport);assert(viewports.every(Boolean));
 // One genuine high-resolution Rome image supplies accurately projected daily crops.
 // No schematic geometry, Google content, geocoding or additional provider calls.
 const west=Math.min(...viewports.map(v=>v.bounds.west)),east=Math.max(...viewports.map(v=>v.bounds.east));
 let top=Math.min(...viewports.map(v=>y(v.bounds.north))),bottom=Math.max(...viewports.map(v=>y(v.bounds.south)));
 const dx=(east-west)/360,dy=bottom-top;
 const width=dx>=dy?1400:Math.floor(1400*dx/dy),height=Math.ceil(width*dy/dx),middle=(top+bottom)/2;
 top=middle-dx*height/width/2;bottom=middle+dx*height/width/2;
 const viewport={width,height,bounds:{west,east,north:lat(top),south:lat(bottom)}};
 const folder=path.join(out,'real-geoapify');await mkdir(folder,{recursive:true});
 const identity=mapCacheHash({version:1,viewport,days,guide:essentials,items:plan.items});
 const pdfPath=path.join(folder,identity+'.pdf'),htmlPath=path.join(folder,identity+'.html');
 try{const pdf=await readFile(pdfPath),html=await readFile(htmlPath,'utf8');assert(!html.includes('Schematic'));assert.equal((html.match(/<image href="data:image\/png;base64,/g)||[]).length,3);return {pdf,html,newRequests:0,cacheReused:true,pages:(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length};}catch{}
 let requests=0;
 const attempts=path.join(folder,'one-request-budget.json');
 const provider=createStaticMapProvider({ownerId:'isolated-rome-marketing-demo',tripId:state.trip.id,renderVersion:'rome-master-v1',fetchImpl:async(url,options)=>{
  // Persistent request budget also prevents a later recording retry from spending again.
  try{await readFile(attempts);throw Error('Demo Geoapify request budget already used.');}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(attempts,JSON.stringify({attemptedAt:new Date().toISOString(),limit:1}),{flag:'wx',mode:0o600});requests++;
  try{const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Geoapify returned HTTP '+response.status);return response;}catch{throw Error('Real Geoapify image unavailable; no retry or schematic substitution.');}
 }});
 const master=await provider.render({viewport,dayContext:{date:plan.dates[0],stops:days.flatMap(day=>day.stops),accommodation:state.tripItems}});
 const imagePath=path.join(folder,'rome-real-master.png');await writeFile(imagePath,Buffer.from(master.dataUrl.split(',')[1],'base64'),{mode:0o600});
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});let crops;
 try{
  const page=await browser.newPage();await page.route('https://**/*',route=>route.abort());
  crops=await page.evaluate(async({dataUrl,master,viewports})=>{
   const image=new Image();image.src=dataUrl;await image.decode();
   const worldY=latitude=>.5-Math.log((1+Math.sin(latitude*Math.PI/180))/(1-Math.sin(latitude*Math.PI/180)))/(4*Math.PI);
   const top=worldY(master.bounds.north),bottom=worldY(master.bounds.south);
   return viewports.map(v=>{const canvas=document.createElement('canvas');canvas.width=v.width*2;canvas.height=v.height*2;const context=canvas.getContext('2d');
    const x=(v.bounds.west-master.bounds.west)/(master.bounds.east-master.bounds.west)*image.width;
    const cy=(worldY(v.bounds.north)-top)/(bottom-top)*image.height;
    const w=(v.bounds.east-v.bounds.west)/(master.bounds.east-master.bounds.west)*image.width;
    const h=(worldY(v.bounds.south)-worldY(v.bounds.north))/(bottom-top)*image.height;
    context.drawImage(image,x,cy,w,h,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');});
  },{dataUrl:master.dataUrl,master:viewport,viewports});
 }finally{await browser.close();}
 const basemapProvider={...provider,render:async({viewport:daily,dayContext})=>{const index=days.findIndex(day=>day.date===dayContext.date);assert(index>=0);return {dataUrl:crops[index],viewport:daily};}};
 // The actual production renderer supplies markers, links, attribution and layout.
 const html=await travelBookHtml(state,plan,wallet,{applicationUrl:'https://tripnexa.app',essentials,basemapProvider});
 assert(!html.includes('Schematic'),'A marketing PDF must have a real basemap for every day');
 assert.equal((html.match(/<image href="data:image\/png;base64,/g)||[]).length,3);
 for(const label of ['Powered by Geoapify','OpenStreetMap contributors','OpenMapTiles','Open live route'])assert(html.includes(label));
 const pdf=await renderPdf(html,{allowEmbeddedImages:true});
 await writeFile(htmlPath,html);await writeFile(pdfPath,pdf);await writeFile(path.join(out,'rome-demo-full-travel-book-real.pdf'),pdf);
 await writeFile(path.join(folder,'report.json'),JSON.stringify({newGeoapifyRequests:requests,geographicDayMaps:3,masterResolution:width*2+'x'+height*2,dailyResolution:'1200x440',source:'Geoapify osm-bright',projection:'Web Mercator; actual daily bounds; no road-route geometry'},null,2));
 return {pdf,html,newRequests:requests,cacheReused:requests===0,pages:(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length};
}
