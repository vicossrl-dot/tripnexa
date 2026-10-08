import test from 'node:test';
import assert from 'node:assert/strict';
import {travelBookHtml,schematicDayMap,printablePublicLink} from '../premium-travel/travel-book.js';
import {itineraryHtml} from '../itinerary-pdf.js';
import {pool} from '../db.js';
test.after(()=>pool.end());
const visit={id:'visit',date:'2026-10-07',step_type:'visit',title:'Museum <script>bad()</script>',start_time:'10:00',end_time:'11:00',location:'Museum address',lat:35,lng:135,ticket_status:'purchased',selection_id:'selection',notes:'PRIVATE_NOTE',source_url:'https://private.invalid?token=SECRET'};
const transfer={id:'transfer',date:visit.date,step_type:'transport',title:'To museum',start_time:'09:00',end_time:'09:30',route_origin:'Hotel address',route_destination:'Museum address',route_mode:'transit',route_duration_min:30};
const state={trip:{id:'trip',name:'Kyoto',destination:'Kyoto',country:'Japan',timezone:'Asia/Tokyo',start_date:visit.date,end_date:visit.date},tripItems:[{category:'stay',title:'Hotel',address:'Hotel address',lat:35.01,lng:135.01}],places:[],items:[transfer,visit],bookings:[{selection_id:'selection',provider:'tiqets'}]};
const plan={dates:[visit.date],items:state.items};
const wallet=[{id:'ticket',category:'place',title:visit.title,date:visit.date,booking_status:'confirmed',confirmation_number:'SECRET_REF',attachments:[{file_url:'/api/uploads/PRIVATE_FILE',original_name:'passport.pdf'}]}];
test('Quick PDF remains the existing compact schedule without additional private content',()=>{
 const html=itineraryHtml(state.trip,plan,state.tripItems,state.places,wallet);assert(html.includes('Your travel itinerary'));assert(html.includes('Ticket / reservation added'));assert(!html.includes('PRIVATE_NOTE'));assert(!html.includes('SECRET_REF'));assert(!html.includes('Full Travel Book'));
});
test('Full Book includes cover, day maps, saved routes, booking/provider, authenticated Wallet links and essentials',async()=>{
 const verifiedAt=new Date().toISOString();
 const essentials={version:4,guideVersion:4,generatedAt:verifiedAt,travelerPassportCountry:'RO',countries:[{code:'JP',country:'Japan',checkedAt:verifiedAt,sections:[{key:'money',title:'Money & currency',facts:[{text:'Fixture-only fact',sourceType:'official',sourceUrl:'https://www.japan.travel/en/plan/',verifiedAt,checkedAt:verifiedAt,evidenceType:'page'}]}]}]};
 const html=await travelBookHtml(state,plan,wallet,{applicationUrl:'https://tripnexa.app',essentials});
 for(const text of ['Full Travel Book','Day Map','not road geometry','Open live route','30 min','tiqets','Bookings &amp; documents','Before You Go','Official source','2026-10-07','class="qr"'])assert(html.includes(text),text);
 assert(html.includes('✓ Verified'));assert(html.includes('<a href="https://www.japan.travel/en/plan/">Official source</a>'));
 assert(html.includes('https://tripnexa.app/trip/trip/wallet?item=ticket'));for(const secret of ['PRIVATE_NOTE','SECRET_REF','PRIVATE_FILE','passport.pdf','token=SECRET','<script>bad()'])assert(!html.includes(secret),secret);
});
test('Full Book does not label AI, trusted or unverified facts as verified official sources',async()=>{
 const verifiedAt=new Date().toISOString(),sourceUrl='https://www.japan.travel/en/plan/';
 const essentials={countries:[{code:'JP',country:'Japan',sections:[
  {key:'money',title:'Money & currency',facts:[
   {text:'Fixture AI payment guidance',sourceType:'ai_general',sourceUrl,verifiedAt,evidenceType:'page'},
   {text:'Fixture unverified currency guidance',sourceType:'official',sourceUrl,verifiedAt},
   {text:'Fixture stale currency guidance',sourceType:'official',sourceUrl,verifiedAt:new Date(Date.now()-2*86400000).toISOString(),evidenceType:'page'}
  ]},
  {key:'power',title:'Power & plugs',facts:[{text:'Fixture trusted plug guidance',sourceType:'trusted',sourceUrl:'https://www.iec.ch/world-plugs',verifiedAt,evidenceType:'page'}]}
 ]}]};
 const html=await travelBookHtml(state,plan,[],{essentials});
 for(const text of ['Fixture AI payment guidance','Fixture unverified currency guidance','Fixture stale currency guidance','Fixture trusted plug guidance'])assert(html.includes(text),text);
 assert(!html.includes('Official source'));assert(!html.includes('✓ Verified'));
});
test('PDF schematic uses only real coordinates and order, retaining explicit missing locations',()=>{
 const svg=schematicDayMap({stops:[{kind:'stay',name:'Hotel',position:{lat:35,lng:135}},{kind:'visit',name:'Unknown',number:1,position:null},{kind:'visit',name:'Museum',number:2,position:{lat:35.01,lng:135.01}}]});assert.equal((svg.match(/class="pdf-stop"/g)||[]).length,2);assert(svg.includes('Not shown on map:'));assert(svg.includes('1. Unknown'));assert(svg.includes('stroke-dasharray'));assert(!svg.includes('tile'));
});
test('No documents are appended and unknown essentials do not become invented advice',async()=>{
 const html=await travelBookHtml(state,plan,[],{applicationUrl:'http://127.0.0.1:5173'});assert(html.includes('No source-checked essentials snapshot'));assert(!html.includes('iframe'));assert(!html.includes('/api/uploads/'));assert(!printablePublicLink('http://localhost:5173/trip/1'));assert(!printablePublicLink('https://private.test/trip'));assert(!printablePublicLink('javascript:alert(1)'));
});
