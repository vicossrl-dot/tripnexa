import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPdfMapViewport,schematicDayMap,renderDayMap} from '../premium-travel/pdf-day-map.js';
import {travelBookHtml} from '../premium-travel/travel-book.js';
import {fixtureMapProvider,pdfMapDay} from './pdf-map-fixture.mjs';
import {pool} from '../db.js';
test.after(()=>pool.end());

test('Real coordinates fit a padded aspect-preserving Mercator viewport without mutating stops',()=>{
 const before=JSON.stringify(pdfMapDay),viewport=fitPdfMapViewport(pdfMapDay);assert.equal(viewport.points.length,3);
 for(const point of viewport.points){assert(point.x>=28&&point.x<=572);assert(point.y>=28&&point.y<=192);}
 assert.equal(JSON.stringify(pdfMapDay),before);assert.equal(viewport.width,600);assert.equal(viewport.height,220);
 const dateline=fitPdfMapViewport({stops:[{position:{lat:35,lng:179.9}},{position:{lat:35,lng:-179.9}}]});assert(dateline.bounds.east-dateline.bounds.west<2);assert(Number.isFinite(dateline.zoom));
 const western=fitPdfMapViewport({stops:[{position:{lat:-34,lng:-58}}]});assert(western.bounds.west<0&&western.bounds.east<0);
});
test('Fallback has a light grid, H and numbered markers, order disclaimer and concise unmapped list',()=>{
 const html=schematicDayMap(pdfMapDay);assert.equal((html.match(/class="pdf-stop"/g)||[]).length,3);
 for(const text of ['pattern','>H</text>','>1</text>','>3</text>','Not shown on map:','2. Tenryū-ji','not road geometry','Schematic map'])assert(html.includes(text),text);
 assert(!html.includes('coordinate unavailable'));assert(!html.includes('<image'));assert(!html.includes('OpenStreetMap'));
});
test('Coincident accommodation/visit coordinates remain anchored and use readable combined labels',()=>{
 const html=schematicDayMap({stops:[{kind:'stay',name:'Hotel',position:{lat:35,lng:135}},{kind:'visit',name:'Lobby',number:1,position:{lat:35,lng:135}}]});assert(html.includes('H / 1'));assert.equal((html.match(/class="pdf-stop"/g)||[]).length,1);
});
test('Licensed fixture adapter supplies exact viewport imagery and visible provider/OSM printed attribution',async()=>{
 const provider=fixtureMapProvider();let seen;const render=provider.render;provider.render=async input=>{seen=input;return render(input);};
 const html=await renderDayMap(pdfMapDay,provider);assert(html.includes('<image href="data:image/png'));assert(html.includes('Fixture imagery only'));assert(html.includes('© OpenStreetMap contributors · ODbL'));assert(html.includes('https://www.openstreetmap.org/copyright'));
 assert(!JSON.stringify(seen).includes('Tenryū-ji'));assert(!JSON.stringify(seen).includes('Museum'));assert(!html.includes('geographic basemap unavailable'));
});
test('Unconfigured, unapproved, Google, failed and mismatched adapters safely fall back',async()=>{
 let calls=0;for(const provider of [null,{name:'Google Maps',printLicense:{permitsCustomerPdfs:true,url:'https://maps.google.com/terms'},render:()=>{calls++;}},{name:'Missing license basis',printLicense:{permitsCustomerPdfs:true},render:()=>{calls++;}},{name:'Unapproved',render:()=>{calls++;}}])assert((await renderDayMap(pdfMapDay,provider)).includes('Schematic map'));
 assert.equal(calls,0);
 const broken=fixtureMapProvider();broken.render=async()=>{throw Error('Fixture outage');};assert((await renderDayMap(pdfMapDay,broken)).includes('Schematic map'));
 const shifted=fixtureMapProvider(),render=shifted.render;shifted.render=async input=>({...await render(input),viewport:{...input.viewport,zoom:1}});assert((await renderDayMap(pdfMapDay,shifted)).includes('Schematic map'));
});
test('All missing coordinates preserve stop names without generating imagery or random points',async()=>{
 let calls=0;const html=await renderDayMap({stops:[{kind:'visit',number:1,name:'Unmapped',position:null}]},{...fixtureMapProvider(),render:()=>{calls++;}});assert.equal(calls,0);assert(html.includes('Not shown on map:'));assert(!html.includes('<svg'));
});
test('Full Book renders one scalable inline QR per day, keeps live Google links and has no raster QR placeholder',async()=>{
 const date=pdfMapDay.date,items=[{id:'route',date,step_type:'transport',route_origin:'Hotel',route_destination:'Museum',route_mode:'walk',title:'Walk',start_time:'09:00',end_time:'09:20'},{id:'visit',date,step_type:'visit',title:'Museum',lat:35.008,lng:135.771,start_time:'09:20',end_time:'10:20'}];
 const state={trip:{id:'trip',name:'Map check',country:'Japan',start_date:date,end_date:date},tripItems:[{category:'stay',title:'Hotel',lat:35.002,lng:135.765}],places:[]};
 const html=await travelBookHtml(state,{dates:[date],items},[],{applicationUrl:'https://tripnexa.app'});assert.equal((html.match(/class="qr"/g)||[]).length,1);assert(html.includes('shape-rendering="crispEdges"'));assert(html.includes('www.google.com/maps/dir/'));assert(html.includes('margin-top:8px;break-inside:avoid'));assert(!html.includes('<img'));assert(!html.includes('maps.googleapis.com'));
});
