import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {openBrowser} from './browser-driver.mjs';
import {serverCatalogs,serverSourceKeys} from '../src/i18n/server-messages.js';

// Local compiled-app UI fixture. No production access, email, booking or paid AI.
const locales=['en','ro','ru','de','fr','es'];
const catalogs=Object.fromEntries(await Promise.all(locales.map(async locale=>[locale,JSON.parse(await fs.readFile(`src/i18n/locales/${locale}.json`,'utf8'))])));
const label=(locale,key)=>serverCatalogs[locale][key]??serverCatalogs[locale][serverSourceKeys.get(catalogs.en[key])]??catalogs[locale][key];
const output=path.resolve('.local/i18n/planner-browser-'+randomUUID()),dist=path.resolve('dist');
await fs.mkdir(output,{recursive:true});await fs.access(path.join(dist,'index.html'));
const server=createServer(async(req,res)=>{
 const resolved=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);
 if(resolved!==dist&&!resolved.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
 let file=resolved;try{if(!(await fs.stat(file)).isFile())file=path.join(dist,'index.html');}catch{file=path.join(dist,'index.html');}
 res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));
}).listen(0,'127.0.0.1');await once(server,'listening');
const origin=`http://127.0.0.1:${server.address().port}`,report={fixture:true,locales,cases:[],untranslatedVisible:[],productionAccess:false,paidAiCalls:0};
let browser;
try{
 console.log('Starting local planner Chrome fixture');
 browser=await openBrowser(output);console.log('Chrome connected');await browser.command('Network.setBlockedURLs',{urls:['https://*','http://maps.*']});await browser.viewport(1280,900);
 await browser.command('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.qaRequests=[];window.qaErrors=[];window.addEventListener('error',e=>window.qaErrors.push(e.error?.stack||e.message));
  const trip={...JSON.parse(localStorage.getItem('planner.trip')||'{}'),id:'qa-trip',name:'Canonical QA Москва',destination:'Rome',destination_city:'Rome',country:'Italy',start_date:'2026-10-08',end_date:'2026-10-09',arrival_datetime:'2026-10-08T08:00',departure_datetime:'2026-10-09T18:00',adults:2,currency:'EUR',transport_mode:'walk',travel_type:'plane',budget_activities:100,share_enabled:true};
  const items=[{id:'qa-visit',trip_id:trip.id,step_type:'visit',title:'Colosseum',date:trip.start_date,start_time:'10:00',end_time:'11:00',duration_min:60,place_lat:41.89,place_lng:12.49,booking_status:'not_required',source_status:'manual'}, {id:'qa-transport',trip_id:trip.id,step_type:'transport',title:'Transfer',route_mode:'walk',route_origin:'Colosseum',route_destination:'Pantheon',date:trip.start_date,start_time:'11:00',end_time:'11:20',duration_min:20,source_status:'estimated'}, {id:'qa-meal',trip_id:trip.id,step_type:'meal',title:'Lunch',date:trip.start_date,start_time:'12:00',end_time:'13:00',duration_min:60}];
  const plan={items,dates:[trip.start_date,trip.end_date],conflicts:[],mealChoicesToReview:[],unscheduledOptional:[],version:1};
  const user=()=>JSON.parse(localStorage.getItem('qa.user')||'null');const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
   const u=new URL(typeof input==='string'?input:input.url,location.href),p=u.pathname;
   if(!p.startsWith('/api/'))return original(input,options);
   const headers=new Headers(options.headers),locale=headers.get('X-TripNexa-Locale');window.qaRequests.push({path:p,method:options.method||'GET',locale,body:typeof options.body==='string'?JSON.parse(options.body):null});
   let data={},status=200;
   if(p==='/api/auth/me'&&options.method==='PATCH'){data={...user(),...JSON.parse(options.body)};localStorage.setItem('qa.user',JSON.stringify(data));}
   else if(p==='/api/auth/me'){data=user();if(!data){status=401;data={error:'Authentication required.'};}}
   else if(p==='/api/auth/logout')localStorage.removeItem('qa.user');
   else if(p==='/api/auth/login'){data={id:'qa-user',display_name:'QA traveler',email:'qa@example.test',role:'USER',ui_locale:localStorage.getItem('qa.account-locale')||'de'};localStorage.setItem('qa.user',JSON.stringify(data));}
   else if(p==='/api/entities/Trip'&&options.method==='POST')data=trip;
   else if(p==='/api/entities/Trip')data=[trip];
   else if(p==='/api/entities/Trip/qa-trip'){if(options.method==='PATCH'){Object.assign(trip,JSON.parse(options.body));localStorage.setItem('planner.trip',JSON.stringify(trip));}data=trip;}
   else if(p==='/api/entities/PlaceSelection')data=JSON.parse(localStorage.getItem('planner.places')||'[]');
   else if(p.includes('/planning/')){data=JSON.parse(options.body).items;if(p.endsWith('/places'))localStorage.setItem('planner.places',JSON.stringify(data));}
   else if(p.startsWith('/api/entities/'))data=[];
   else if(p==='/api/trips/qa-trip/itinerary')data=plan;
   else if(p==='/api/trips/qa-trip/wallet')data={items:[]};
   else if(p.endsWith('/localized-content'))data={locale,translations:{}};
   else if(p.endsWith('/weather'))data={days:[{date:trip.start_date,locationLabel:'Rome',kind:'typical',temperature:{highC:22,lowC:13},climatePeriod:'1991–2020'}]};
   else if(p.endsWith('/health'))data={status:'READY',issues:[],checks:[{title:'Travel dates',ready:true}],beforeGo:[],nextActions:[],ready:true,optionalSaved:0};
   else if(p==='/api/billing/trips/qa-trip')data={premium:true};
   else if(p.endsWith('/interactive-map'))data={configured:false};
   else if(p.endsWith('/share-url'))data={url:location.origin+'/share/qa-share'};
   else if(p.startsWith('/api/shared/'))data={trip,items:items.filter(i=>i.step_type==='visit')};
   else if(p.includes('/tickets')||p.includes('/affiliate/'))data={ticketable:true,booking:{},context:{name:'Colosseum',city:'Rome',country:'Italy'},providers:[{provider:'klook',name:'Klook',description:'Tickets, tours & experiences',url:'https://example.test'}],disclosure:'Some links are affiliate links.'};
   else if(p.includes('/meals/'))data={token:'qa-token',context:{anchor:{name:'Pantheon'}},notice:'Opening hours may change.',restaurants:[{place_id:'qa-restaurant',name:'Official Restaurant',category:'restaurant',price_label:'Moderate',rating:4.5,review_count:120,distance_m:120,address:'Rome, Italy',maps_url:'https://maps.google.com'}]};
   else if(p.includes('/essentials'))data={countries:[],status:'empty',updates:{blocked:false}};
   else if(p==='/api/billing/status')data={enabled:false};
   else if(p==='/api/billing/orders')data={items:[]};
   else if(p==='/api/auth/providers')data={providers:[]};
   else if(p==='/api/account/identities')data={identities:[],has_password:true,recent_auth:true};
   else if(p==='/api/account/sessions')data={items:[]};
   else if(p==='/api/account/deletion')data={request:null};
   else if(p==='/api/config')data={ai:true,imageGeneration:false,places:false};
   else if(p==='/api/ai/trip-names')data={names:['QA Rome','QA Roma','QA Рим'],source:'fallback'};
   else if(p==='/api/ai/planning-suggestions')data={suggestions:[{name:'Garden fixture',place_id:'fixture-garden',visit_duration_min:45,fit_reason:'Garden',category:'nature'}],source:'fallback'};
   else if(p.endsWith('/itinerary/preview'))data={token:'qa-preview',summary:'Fixture preview',changes:[],warnings:[],items:plan.items};
   else if(p.endsWith('/itinerary/apply'))data=plan;
   else if(p==='/api/places/autocomplete')data={suggestions:[]};
   else if(p.endsWith('/photos'))data={photos:[]};
   return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  };
 `});
 const navigate=async(locale,route,authenticated=true)=>{
  await browser.evaluate(`localStorage.setItem('tripnexa.locale',${JSON.stringify(locale)});sessionStorage.removeItem('tripnexa.locale.pending');${authenticated?`localStorage.setItem('qa.user',JSON.stringify({id:'qa-user',display_name:'QA traveler',email:'qa@example.test',role:'USER',ui_locale:${JSON.stringify(locale)}}))`:`localStorage.removeItem('qa.user')`}`);
  await browser.command('Page.navigate',{url:origin+route});
  await browser.wait(`document.documentElement.lang===${JSON.stringify(locale)}&&!!document.querySelector('h1,h2,input,main')`);await new Promise(resolve=>setTimeout(resolve,200));
 };
 const record=async(locale,area)=>{
  const text=await browser.evaluate('document.body.innerText');assert(text.trim().length>10,area+' must render');
  assert(!/\b(?:ui|server\.copy)\.[a-z][a-z.0-9]*\b/.test(text),'No raw translation keys: '+area);
  assert.deepEqual(await browser.evaluate('window.qaErrors'),[],area+' must not throw');
  // Branding/origin configuration is language-neutral and deliberately outside prose API checks.
  const requests=(await browser.evaluate('window.qaRequests')).filter(request=>!['/api/application-urls','/api/public-settings'].includes(request.path));assert(requests.every(request=>request.locale===locale),'Selected locale headers: '+area+' '+JSON.stringify(requests.filter(request=>request.locale!==locale)));
  const untranslated=locale==='en'?[]:Object.entries(catalogs.en).filter(([key,value])=>/[A-Za-z]{4}/.test(value)&&value.length>12&&!value.includes('{{')&&label(locale,key)===value&&text.includes(value)).map(([key,value])=>({key,english:value}));
  if(untranslated.length)report.untranslatedVisible.push({locale,area,entries:untranslated});report.cases.push({locale,area,rendered:true,requestLocale:true,englishFallbacks:untranslated.length});
 };

 await browser.command('Page.navigate',{url:origin+'/login'});await browser.wait("!!document.querySelector('input')");
 for(const locale of locales){
  console.log('Planner locale',locale);
  await navigate(locale,'/trip/qa-trip/plan?step=4');
  await browser.wait("!!document.querySelector('#ai-suggestions-heading')");
  assert.equal(await browser.evaluate("document.querySelectorAll('aside [data-plan-step]').length"),5);
  assert.equal(await browser.evaluate("document.querySelector('main h2').textContent"),catalogs[locale]['planner.places']);
  assert.equal(await browser.evaluate("window.qaRequests.filter(r=>r.path==='/api/ai/planning-suggestions').length"),0);
  for(const width of [390,1280]){await browser.viewport(width,900);assert(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),locale+' overflow');}
 }
 console.log('Planner CRUD');
 await navigate('en','/trip/qa-trip/plan?step=4');
 await browser.wait("!!document.querySelector('#must-see-heading')");
 await browser.input('#desired-place-search','Must see fixture');await browser.click('Add manually');
 await browser.wait("document.querySelectorAll('[data-desired-place]').length===1");
 await browser.wait("JSON.parse(localStorage.getItem('planner.places')||'[]').length===1");
 assert.equal(await browser.evaluate("JSON.parse(localStorage.getItem('planner.places'))[0].priority"),'mandatory');
 await browser.input('[data-desired-place] input','Edited must see');
 await browser.wait("JSON.parse(localStorage.getItem('planner.places'))[0].name==='Edited must see'");
 await browser.evaluate("document.querySelector('[data-desired-place] button[aria-label]').click()");
 await browser.wait("JSON.parse(localStorage.getItem('planner.places')).length===0");
 await browser.click('Generate suggestions');await browser.wait("!!document.querySelector('[data-suggestion-card]')");
 await browser.click('Accept');await browser.wait("JSON.parse(localStorage.getItem('planner.places')||'[]').some(p=>p.priority==='preferred'&&p.selection_source==='ai')");
 assert.equal(await browser.evaluate("window.qaRequests.filter(r=>r.path==='/api/ai/planning-suggestions').length"),1);
 await browser.click('Reject');await browser.wait("JSON.parse(localStorage.getItem('planner.places'))[0].priority==='excluded'");
 await browser.click('Accept');await browser.wait("JSON.parse(localStorage.getItem('planner.places'))[0].priority==='preferred'");
 await browser.command('Page.reload');await browser.wait("!!document.querySelector('#ai-suggestions-heading')");
 assert.equal(await browser.evaluate("window.qaRequests.filter(r=>r.path==='/api/ai/planning-suggestions').length"),0);
 await browser.click('Save & continue');await browser.wait("document.querySelector('[data-plan-step=\"4\"]').getAttribute('aria-current')==='step'");
 assert.equal(await browser.evaluate("JSON.parse(localStorage.getItem('planner.trip')).planning_step"),5);
 await browser.click('Back');await browser.wait("!!document.querySelector('#must-see-heading')");
 assert.equal(await browser.evaluate('scrollY'),0);
 await browser.command('Page.reload');await browser.wait("!!document.querySelector('#must-see-heading')");
 for(const [saved,expected] of [[4,3],[5,4]]){
  await browser.evaluate(`localStorage.setItem('planner.trip',JSON.stringify({planning_step:${saved}}))`);
  await navigate('en','/trip/qa-trip/plan');
  await browser.wait(`document.querySelector('[data-plan-step="${expected}"]').getAttribute('aria-current')==='step'`);
 }
 await navigate('en','/trip/qa-trip/plan?step=5');await browser.wait("document.querySelector('[data-plan-step=\"4\"]').getAttribute('aria-current')==='step'");
 assert.deepEqual(await browser.evaluate('window.qaErrors'),[]);
 console.log('Planner: five steps, six locales, legacy resume/URLs, refresh, navigation, scroll, manual CRUD/autosave, explicit AI only, accept/reject and desktop/mobile passed.');
}catch(error){console.error(error);throw error;}finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
