import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';

test('MySQL regression: AI suggestions → Google resolution → accept three → generate → load; preview/apply is atomic and scoped',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
 assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/);process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';
 const {pool}=await import('../db.js'),{migrate}=await import('../migrate.js'),{config}=await import('../config.js'),{hashPassword}=await import('../security.js'),{createApp}=await import('../app.js');
 await migrate();config.aiKey='fixture';config.aiModel='fixture';config.googleMapsKey='fixture';
 const owner=randomUUID(),other=randomUUID(),password='regression password 12345';
 for(const id of [owner,other])await pool.execute('INSERT INTO users(id,email,password_hash,email_verified)VALUES(?,?,?,TRUE)',[id,id+'@example.test',await hashPassword(password)]);
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}/api`;
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));for(const id of [owner,other])await pool.execute('DELETE FROM users WHERE id=?',[id]);await pool.end();});
 const realFetch=globalThis.fetch;let changeTarget;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url).startsWith('https://places.googleapis.com/v1/places/'))return Response.json({businessStatus:'OPERATIONAL'});
  if(String(url)==='https://places.googleapis.com/v1/places:searchText'){
   const name=JSON.parse(options.body).textQuery.split(',')[0];return Response.json({places:[{id:'google-'+name.replaceAll(' ','-'),displayName:{text:name},formattedAddress:'Central Rome',location:{latitude:41.9,longitude:12.49},primaryType:'park',addressComponents:[{types:['locality'],longText:'Rome'},{types:['country'],longText:'Italy'}]}]});
  }
  if(String(url)!=='https://api.openai.com/v1/responses')return realFetch(url,options);
  const body=JSON.parse(options.body),context=JSON.parse(body.input);assert.equal(context.trip.special_wishes,'Keep one afternoon free.');assert(body.instructions.includes('special_wishes'));let result;
  if(body.text.format.name==='planning_suggestions')result={suggestions:['Garden One','Garden Two','Garden Three'].map(name=>({name,aliases:[],fit_reason:'Near the stay; short visits preserve a free afternoon.',category:'nature',area:'Centro',address:'Rome',visit_duration_min:30,best_time_of_day:'morning',indoor_outdoor:'outdoor'}))};
  else if(body.text.format.name==='itinerary_route')result={preferred_windows:[],visits:context.selected.map(p=>({selection_id:p.selection_id,date:'2026-10-02',preferred_start:'',reason:'Short nearby visits.'}))};
  else result={summary:'Move one visit to Day 3.',preferred_windows:[{date:'2026-10-02',windows:[{start:'09:00',end:'13:00'}]}],changes:[{selection_id:changeTarget,action:'move',date:'2026-10-03',start_time:'',reason:'Leave the second afternoon free.',name:'Garden Three',duration_min:30}]};
  return Response.json({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
 });
 const call=async(url,body,method=body?'POST':'GET',cookie=first)=>{const response=await fetch(origin+url,{method,headers:{'Content-Type':'application/json','X-Requested-With':'TripSync',Cookie:cookie||''},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 let first;first=(await call('/auth/login',{email:owner+'@example.test',password},'POST','')).cookie;
 const second=(await call('/auth/login',{email:other+'@example.test',password},'POST','')).cookie;
 const trip=(await call('/entities/Trip',{name:'Regression',destination:'Rome',start_date:'2026-10-01',end_date:'2026-10-03',special_wishes:'Keep one afternoon free.',buffer_min:5,meal_duration_min:30,transport_preference:'taxi'})).data;
 await call('/entities/TripItem',{trip_id:trip.id,title:'Stay',category:'stay',lat:41.9,lng:12.49,address:'Rome'});
 const suggestions=await call('/ai/planning-suggestions',{trip_id:trip.id});assert.equal(suggestions.status,200);assert.equal(suggestions.data.suggestions.length,3);
 const accepted=[];for(const suggested of suggestions.data.suggestions){const location=await call('/places/resolve',{name:suggested.name,destination:'Rome'});assert.equal(location.status,200);accepted.push({...location.data.place,id:randomUUID(),trip_id:trip.id,priority:'preferred',desired_duration_min:suggested.visit_duration_min,fit_reason:suggested.fit_reason,selection_source:'ai',status:'resolved'});}
 const saved=await call(`/trips/${trip.id}/planning/places`,{items:accepted},'PUT');assert.equal(saved.status,200);assert(saved.data.every(p=>p.lat&&p.place_id));
 const built=await call(`/trips/${trip.id}/itinerary`,{use_ai:true});assert.equal(built.status,200,JSON.stringify(built));assert.equal(built.data.generation,'ai');assert.equal(built.data.conflicts.length,0);assert.equal(built.data.items.filter(i=>i.step_type==='visit').length,3);
 const loaded=await call(`/trips/${trip.id}/itinerary`);assert.deepEqual(loaded.data.items,built.data.items);changeTarget=loaded.data.items.find(i=>i.step_type==='visit').selection_id;
 const before=JSON.stringify(loaded.data.items);const preview=await call(`/trips/${trip.id}/itinerary/preview`,{expected_version:loaded.data.version,request:'Move one activity from Day 2 to Day 3 and leave Day 2 afternoon free.'});assert.equal(preview.status,200,JSON.stringify(preview));
 assert.equal(JSON.stringify((await call(`/trips/${trip.id}/itinerary`)).data.items),before);
 assert.equal((await call(`/trips/${trip.id}/itinerary/apply`,{token:preview.data.token},'POST',second)).status,409);
 const applied=await call(`/trips/${trip.id}/itinerary/apply`,{token:preview.data.token});assert.equal(applied.status,200,JSON.stringify(applied));assert.equal(applied.data.items.find(i=>i.selection_id===changeTarget).date,'2026-10-03');
 assert.deepEqual(applied.data.items.filter(i=>i.date==='2026-10-01'),loaded.data.items.filter(i=>i.date==='2026-10-01'));
 assert.equal((await call('/entities/Trip/'+trip.id)).data.special_wishes,'Keep one afternoon free.');assert.equal((await call(`/trips/${trip.id}/itinerary/apply`,{token:preview.data.token})).status,409);
 changeTarget=applied.data.items.find(i=>i.step_type==='visit'&&i.date==='2026-10-02').selection_id;
 const stale=await call(`/trips/${trip.id}/itinerary/preview`,{expected_version:applied.data.version,request:'Move another activity to Day 3.'});assert.equal(stale.status,200,JSON.stringify(stale));
 await call('/entities/Trip/'+trip.id,{name:'Edited in another tab'},'PATCH');assert.equal((await call(`/trips/${trip.id}/itinerary/apply`,{token:stale.data.token})).status,409);
 assert.deepEqual((await call(`/trips/${trip.id}/itinerary`)).data.items,applied.data.items);
 assert.equal((await realFetch(origin+`/trips/${trip.id}/itinerary/pdf`)).status,401);assert.equal((await realFetch(origin+`/trips/${trip.id}/itinerary/pdf`,{headers:{Cookie:second}})).status,404);
});
