import test from 'node:test';
import assert from 'node:assert/strict';
import {createStaticMapProvider} from '../premium-travel/static-map-provider.js';
import {fitPdfMapViewport,renderDayMap,pdfDayWithAccommodation} from '../premium-travel/pdf-day-map.js';
import {fixtureMapPng,pdfMapDay} from './pdf-map-fixture.mjs';

const image=fixtureMapPng(1200,440);
const pngResponse=()=>new Response(image,{headers:{'content-type':'image/png'}});
const viewportFor=day=>{const {points,...viewport}=fitPdfMapViewport(day);assert(points.length);return viewport;};

test('Missing key never provisions credentials or makes an external call',async()=>{
 let calls=0;const provider=createStaticMapProvider({apiKey:'',fetchImpl:()=>{calls++;}});
 assert.equal(provider,null);assert((await renderDayMap(pdfMapDay,provider)).includes('Schematic map'));assert.equal(calls,0);
});
test('Server request uses exact auto-fitted geographic bounds, retina PNG and default attribution',async()=>{
 let request;const provider=createStaticMapProvider({apiKey:'test-placeholder',fetchImpl:async(url,options)=>{request={url,options};return pngResponse();}});
 const viewport=viewportFor(pdfMapDay),result=await provider.render({viewport,signal:AbortSignal.timeout(5000)}),params=request.url.searchParams;
 assert.equal(request.url.origin,'https://maps.geoapify.com');assert.equal(request.url.pathname,'/v1/staticmap');assert.equal(params.get('style'),'osm-bright');assert.equal(params.get('scaleFactor'),'2');assert.equal(params.get('format'),'png');assert.equal(params.get('width'),'600');assert.equal(params.get('height'),'220');assert.equal(params.get('attribution'),'default');
 assert.equal(params.get('area'),`rect:${viewport.bounds.west},${viewport.bounds.south},${viewport.bounds.east},${viewport.bounds.north}`);assert.equal(request.options.redirect,'error');assert(request.options.signal);
 for(const forbidden of ['marker','geometry','geojson','center','zoom'])assert(!params.has(forbidden));assert(!request.url.href.includes('Museum'));assert.deepEqual(result.viewport,viewport);assert(!result.dataUrl.includes('test-placeholder'));
 const html=await renderDayMap(pdfMapDay,provider);for(const text of ['<image href="data:image/png','Powered by Geoapify','© OpenMapTiles','© OpenStreetMap contributors','https://www.openstreetmap.org/copyright','>H</text>','>1</text>','>3</text>','Not shown on map:','No road route is drawn'])assert(html.includes(text),text);assert(!html.includes('Schematic'));assert(!html.includes('stroke-dasharray'));assert(!html.includes('test-placeholder'));
});
test('Identical concurrent/repeated day viewports make exactly one request per export',async()=>{
 let calls=0;const provider=createStaticMapProvider({apiKey:'test-placeholder',fetchImpl:async()=>{calls++;return pngResponse();}});
 const results=await Promise.all([renderDayMap(pdfMapDay,provider),renderDayMap(pdfMapDay,provider)]);await renderDayMap({...pdfMapDay,date:'2026-10-08'},provider);
 assert.equal(calls,1);assert(results.every(html=>html.includes('Geographic map')));
});
test('429, outages, invalid/wrong-sized/oversized images and cancelled requests use emergency fallback',async()=>{
 const wrong=fixtureMapPng(),tiny=Buffer.from('not a map');
 for(const fetchImpl of [async()=>new Response('quota',{status:429}),async()=>{throw Error('outage');},async()=>new Response(tiny,{headers:{'content-type':'image/png'}}),async()=>new Response(wrong,{headers:{'content-type':'image/png'}}),async()=>new Response(image,{headers:{'content-type':'image/png','content-length':String(6*1024*1024)}}),async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array(6*1024*1024));controller.close();}}),{headers:{'content-type':'image/png'}})]){
  const html=await renderDayMap(pdfMapDay,createStaticMapProvider({apiKey:'test-placeholder',fetchImpl}));assert(html.includes('Schematic map'));assert(!html.includes('<image'));
 }
 let calls=0;const provider=createStaticMapProvider({apiKey:'test-placeholder',fetchImpl:()=>{calls++;}}),controller=new AbortController();controller.abort();await assert.rejects(provider.render({viewport:viewportFor(pdfMapDay),signal:controller.signal}));assert.equal(calls,0);
});
test('Unmapped days make no API call; missing coordinates never become markers or route geometry',async()=>{
 let calls=0;const provider=createStaticMapProvider({apiKey:'test-placeholder',fetchImpl:()=>{calls++;}}),html=await renderDayMap({stops:[{kind:'visit',number:1,name:'Unknown',position:null}]},provider);assert.equal(calls,0);assert(html.includes('1. Unknown'));assert(!html.includes('<svg'));
});
test('Saved active hotel has an H marker without a transfer, with no duplicated hotel or itinerary changes',()=>{
 const day={date:'2026-10-07',stops:pdfMapDay.stops.filter(stop=>stop.kind!=='stay')},before=JSON.stringify(day),hotel={category:'stay',title:'Hotel',lat:35.002,lng:135.765,date:'2026-10-07',end_date:'2026-10-08'};
 const mapped=pdfDayWithAccommodation(day,[hotel,{...hotel,date:'2026-10-10'}]);assert.equal(mapped.stops[0].kind,'stay');assert.equal(mapped.stops[1].number,1);assert.equal(JSON.stringify(day),before);assert.equal(pdfDayWithAccommodation(mapped,[hotel]).stops.length,mapped.stops.length);assert.equal(pdfDayWithAccommodation({...day,date:'2026-10-09'},[hotel]).stops.length,day.stops.length);
});
