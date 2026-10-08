import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createStaticMapProvider} from '../premium-travel/static-map-provider.js';
import {renderDayMap,pdfDayWithAccommodation} from '../premium-travel/pdf-day-map.js';
import {fixtureMapPng,pdfMapDay} from './pdf-map-fixture.mjs';

const image=fixtureMapPng(1200,440),pngResponse=()=>new Response(image,{headers:{'content-type':'image/png'}});
await mkdir('.local',{recursive:true});
const directory=()=>mkdtemp(path.resolve('.local/pdf-map-cache-test-'));
const recordFiles=async root=>{const files=[];for(const folder of await readdir(root))for(const file of await readdir(path.join(root,folder)))if(file.endsWith('.json'))files.push(path.join(root,folder,file));return files;};
const options=root=>({apiKey:'test-placeholder',ownerId:'owner',tripId:'trip',cacheDirectory:root});
const copy=value=>structuredClone(value);
const geographic=html=>assert(html.includes('Geographic map'));

test('Unchanged day reuses private disk cache across provider instances and API-key rotation, without TTL',async()=>{
 const root=await directory();let calls=0;
 geographic(await renderDayMap(pdfMapDay,createStaticMapProvider({...options(root),fetchImpl:async()=>{calls++;return pngResponse();}})));
 for(let index=0;index<3;index++)geographic(await renderDayMap(pdfMapDay,createStaticMapProvider({...options(root),apiKey:'rotated-test-placeholder',fetchImpl:async()=>{calls++;throw Error('Must use disk cache');}})));
 geographic(await renderDayMap(pdfMapDay,createStaticMapProvider({...options(root),apiKey:'',fetchImpl:()=>{calls++;throw Error('Cached image needs no key');}})));
 assert.equal(calls,1);const files=await recordFiles(root);assert.equal(files.length,1);
 const record=await readFile(files[0],'utf8');assert(!record.includes('test-placeholder'));assert(!record.includes('owner'));assert(!record.includes('Hotel'));assert(!record.includes('135.765'));assert.deepEqual(Buffer.from(JSON.parse(record).png,'base64'),image);
 assert(!record.includes('retryAfter'),'Successful images have no automatic expiry');
});
test('Concurrent Full Book downloads share one request across different provider instances',async()=>{
 const root=await directory();let calls=0;
 const fetchImpl=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,100));return pngResponse();};
 const result=await Promise.all(Array.from({length:8},()=>renderDayMap(pdfMapDay,createStaticMapProvider({...options(root),fetchImpl}))));result.forEach(geographic);assert.equal(calls,1);assert.equal((await recordFiles(root)).length,1);
});
test('Separate backend processes share the disk lock and cached map survives process restart',async()=>{
 const root=await directory();
 const code=`import {createStaticMapProvider} from ${JSON.stringify(new URL('../premium-travel/static-map-provider.js',import.meta.url).href)};
 import {renderDayMap} from ${JSON.stringify(new URL('../premium-travel/pdf-day-map.js',import.meta.url).href)};
 let requests=0;const provider=createStaticMapProvider({...${JSON.stringify(options(root))},fetchImpl:async()=>{requests++;await new Promise(resolve=>setTimeout(resolve,200));return new Response(Buffer.from(${JSON.stringify(image.toString('base64'))},'base64'),{headers:{'content-type':'image/png'}});}});
 const html=await renderDayMap(${JSON.stringify(pdfMapDay)},provider);console.log(JSON.stringify({requests,geographic:html.includes('Geographic map')}));`;
 const worker=()=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--input-type=module','--eval',code],{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.on('error',reject);child.on('close',exit=>{if(exit!==0)return reject(new Error(stderr||'Cache worker failed'));try{resolve(JSON.parse(stdout));}catch(error){reject(error);}});
 });
 const results=await Promise.all([worker(),worker()]);assert(results.every(result=>result.geographic));assert.equal(results.reduce((sum,result)=>sum+result.requests,0),1);assert.deepEqual(await worker(),{requests:0,geographic:true});
});
test('Only map context changes invalidate; changed order/mapped stop/hotel/style/version each generate once',async()=>{
 const root=await directory();let calls=0;const fetchImpl=async()=>{calls++;return pngResponse();};
 const render=(day=pdfMapDay,extra={})=>renderDayMap(day,createStaticMapProvider({...options(root),fetchImpl,...extra}));
 geographic(await render());
 geographic(await render({...pdfMapDay,notes:'Private note changed',weather:'Rain',stops:pdfMapDay.stops.map(stop=>({...stop,time:'12:00'}))}));assert.equal(calls,1,'Unrelated details do not invalidate imagery');
 const changedCoordinate=copy(pdfMapDay);changedCoordinate.stops[1].position.lat+=.0001;geographic(await render(changedCoordinate));assert.equal(calls,2);
 const changedOrder=copy(pdfMapDay);[changedOrder.stops[1],changedOrder.stops[3]]=[changedOrder.stops[3],changedOrder.stops[1]];geographic(await render(changedOrder));assert.equal(calls,3,'Order change invalidates even with unchanged bounds');
 const changedStop=copy(pdfMapDay);changedStop.stops[1].id='new-mapped-stop';geographic(await render(changedStop));assert.equal(calls,4);
 const addedStop=copy(pdfMapDay);addedStop.stops.push({id:'new-stop',number:4,kind:'visit',position:{lat:35.007,lng:135.765}});geographic(await render(addedStop));assert.equal(calls,5);
 const hotel={id:'hotel-a',category:'stay',title:'Hotel A',lat:35.002,lng:135.765};
 geographic(await render(pdfDayWithAccommodation(pdfMapDay,[hotel])));geographic(await render(pdfDayWithAccommodation(pdfMapDay,[{...hotel,id:'hotel-b',title:'Hotel B'}])));assert.equal(calls,7,'Hotel identity invalidates at identical coordinates');
 geographic(await render(pdfMapDay,{style:'osm-bright-grey'}));geographic(await render(pdfMapDay,{renderVersion:'future-test-version'}));assert.equal(calls,9);
 geographic(await render());assert.equal(calls,9,'Restoring an unchanged prior context reuses its record');
});
test('Owner, trip and day namespaces are isolated; no requests on provider creation',async()=>{
 const root=await directory();let calls=0;const fetchImpl=async()=>{calls++;return pngResponse();};
 const first=createStaticMapProvider({...options(root),fetchImpl});assert.equal(calls,0);assert.deepEqual(await readdir(root),[]);
 for(const [day,extra]of [[pdfMapDay,{}],[{...pdfMapDay,date:'2026-10-08'},{}],[pdfMapDay,{tripId:'different-trip'}],[pdfMapDay,{ownerId:'different-owner'}]])geographic(await renderDayMap(day,createStaticMapProvider({...options(root),fetchImpl,...extra})));
 assert.equal(calls,4);assert.equal((await readdir(root)).length,3);assert.equal((await recordFiles(root)).length,4);assert(!JSON.stringify(await readdir(root)).includes('owner'));
});
test('Corrupt cache is replaced once; digest validation rejects changed PNG bytes',async()=>{
 const root=await directory();let calls=0;const render=()=>renderDayMap(pdfMapDay,createStaticMapProvider({...options(root),fetchImpl:async()=>{calls++;return pngResponse();}}));
 geographic(await render());const [filename]=await recordFiles(root);const record=JSON.parse(await readFile(filename,'utf8'));record.png=fixtureMapPng(1200,440).toString('base64').replace(/^./,'A');await writeFile(filename,JSON.stringify(record));
 geographic(await render());geographic(await render());assert.equal(calls,2);assert.equal((await readdir(path.dirname(filename))).filter(file=>file.endsWith('.lock')||file.endsWith('.tmp')).length,0);
});
test('Quota/outage failures use persistent five-minute backoff and never cache schematic as a PNG',async()=>{
 const root=await directory();let calls=0;const render=()=>renderDayMap(pdfMapDay,createStaticMapProvider({...options(root),fetchImpl:async()=>{calls++;return new Response('Quota reached',{status:429});}}));
 for(let index=0;index<3;index++)assert((await render()).includes('Schematic map'));assert.equal(calls,1);
 const [filename]=await recordFiles(root),record=JSON.parse(await readFile(filename,'utf8'));assert(record.retryAfter>Date.now());assert(!record.png);
 await writeFile(filename,JSON.stringify({...record,retryAfter:Date.now()-1}));assert((await render()).includes('Schematic map'));assert.equal(calls,2);
});
test('Unwritable/unavailable cache falls back before a metered request; unmapped days do not create cache',async()=>{
 const root=await directory(),block=path.join(root,'not-a-directory');await writeFile(block,'fixture');let calls=0;
 const provider=createStaticMapProvider({...options(block),fetchImpl:()=>{calls++;}});assert((await renderDayMap(pdfMapDay,provider)).includes('Schematic map'));assert.equal(calls,0);
 const emptyRoot=await directory();assert((await renderDayMap({date:pdfMapDay.date,stops:[{number:1,name:'Unknown',position:null}]},createStaticMapProvider({...options(emptyRoot),fetchImpl:()=>{calls++;}}))).includes('No saved coordinates'));assert.equal(calls,0);assert.deepEqual(await readdir(emptyRoot),[]);
});
