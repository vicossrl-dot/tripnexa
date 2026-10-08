import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
assert.match(process.env.MYSQL_TEST_DATABASE||'',/_test$/,'Use an isolated MySQL test database.');
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;
const {pool}=await import('../db.js');
const {createEssentialsAccounting,ESSENTIALS_WINDOW_MS}=await import('../premium-travel/essentials-limits.js');
const {refreshEssentials,savedEssentials,essentialsWithUpdates}=await import('../premium-travel/essentials.js');
const {retrieveEssentials}=await import('../premium-travel/essentials-provider.js');
const {provider}=await import('../ai.js');
const {essentialsPdfHtml}=await import('../premium-travel/essentials-pdf.js');
const {travelBookHtml}=await import('../premium-travel/travel-book.js');
const {essentialsState,guideValues,practicalResponse}=await import('./essentials-fast-fixture.mjs');
const {essentialsWaitMessage}=await import('../../src/lib/essentials-updates.js');
const accounting=createEssentialsAccounting({tripLimit:2,userLimit:20}),owners=[];
async function owner(){const id=randomUUID();owners.push(id);await pool.execute('INSERT INTO users(id,email,email_verified) VALUES(?,?,TRUE)',[id,id+'@essentials-limit.test']);return id;}
async function trip(ownerId){const id=randomUUID();await pool.execute('INSERT INTO trips(id,owner_id,name) VALUES(?,?,?)',[id,ownerId,'Isolated Essentials limit fixture']);return {...essentialsState,ownerId,trip:{...essentialsState.trip,id}};}
const quiet={log:()=>{}};
function requests(mode='success'){
 const calls=[];
 return {calls,retrieve:(context,options)=>retrieveEssentials(context,{...quiet,configured:true,timeoutMs:mode==='timeout'?200:45000,...options,
  call:(path,body,_fetch,timeout,hooks)=>provider(path,body,async(_url,{signal})=>{
   calls.push(JSON.parse(body.input).travelerPassportCountry);
   if(mode==='error')throw Error('Offline provider fixture');
   if(mode==='timeout')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
   const guide=structuredClone(guideValues);if(mode==='partial')guide.connectivity=null;
   return new Response(JSON.stringify(practicalResponse({JP:guide})),{headers:{'Content-Type':'application/json'}});
  },timeout,hooks)
 })};
}
const refresh=(state,passport,work,extra={})=>refreshEssentials(state,passport,{...quiet,accounting,retrieve:work.retrieve,...extra});
async function count(ownerId){return Number((await pool.execute("SELECT COALESCE(SUM(count),0) AS total FROM usage_counters WHERE scope=? AND operation LIKE 'essentials-update:%'",[ownerId]))[0][0].total);}
function worker(ownerId,tripId,reserve=false){
 const code=`import {essentialsAccounting} from './server/premium-travel/essentials-limits.js';import {pool} from './server/db.js';try {let result;try{if(process.argv[3]==='reserve'){await essentialsAccounting.reserve(process.argv[1],process.argv[2]);result={allowed:true};}else result=await essentialsAccounting.read(process.argv[1],process.argv[2]);}catch(error){result={code:error.code};}console.log(JSON.stringify(result));}finally{await pool.end();}`;
 return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code,ownerId,tripId,reserve?'reserve':'read'],{windowsHide:true,env:{...process.env,ESSENTIALS_MAX_UPDATES_PER_TRIP_24H:'2',ESSENTIALS_MAX_UPDATES_PER_USER_24H:'20'},stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>errors+=value);child.on('error',reject);child.on('exit',status=>status?reject(Error('Worker failed: '+errors)):resolve(JSON.parse(output.trim())));});
}
test.after(async()=>{for(const id of owners){await pool.execute('DELETE FROM usage_counters WHERE scope=?',[id]);await pool.execute('DELETE FROM users WHERE id=?',[id]);}await pool.end();});

test('Persistent Essentials rolling limits use existing MySQL quota rows, with no live provider calls',async t=>{
 await t.test('First/second attempt succeed; third is blocked; passport toggling and cached contexts cannot bypass',async()=>{
  const id=await owner(),state=await trip(id),work=requests();
  const first=await refresh(state,'MD',work);assert.equal(first.generation.status,'complete');assert.deepEqual(work.calls,['MD']);assert.equal(await count(id),1);
  const repeated=await refresh(state,'MD',work,{now:Date.now()+3600000});assert(repeated.updateSkipped);assert.equal(work.calls.length,1);
  const second=await refresh(state,'RO',work);assert.equal(second.generation.status,'complete');assert.deepEqual(work.calls,['MD','RO']);
  for(const passport of ['PA','AL','US']){const blocked=await refresh(state,passport,work);assert.equal(blocked.code,'ESSENTIALS_DAILY_LIMIT');assert(blocked.nextAllowedAt);assert.equal(blocked.updates.remaining,0);}
  assert.equal(work.calls.length,2);assert.equal(await count(id),2);
  assert((await refresh(state,'MD',work)).updateSkipped);assert.equal(work.calls.length,2);
  const blocked=await refresh(state,'PA',work),display=await essentialsWithUpdates(state,'PA',blocked,{accounting});
  assert(display.generatedAt);assert(display.cachedForDifferentContext);assert(display.countries[0].sections.find(section=>section.key==='power').facts.length);
  assert(!display.countries[0].sections.find(section=>section.key==='entryDocuments').facts.some(fact=>fact.verifiedAt));
  assert((await savedEssentials(state,display.cachedPassportCountry)).generatedAt,'The existing PDF endpoint can still read the last saved passport context');
  const separate=await worker(id,state.trip.id);assert(separate.blocked);assert.equal(separate.remaining,0);assert.equal((await worker(id,state.trip.id,true)).code,'ESSENTIALS_DAILY_LIMIT');
 });
 await t.test('Open/reopen, standalone PDF and Full Travel Book reuse snapshots without attempts',async()=>{
  const id=await owner(),state=await trip(id),work=requests();await refresh(state,'RO',work);
  for(let i=0;i<2;i++){const saved=await savedEssentials(state,'RO');await essentialsWithUpdates(state,'RO',saved,{accounting});assert(essentialsPdfHtml(state.trip,saved).includes('100V'));assert((await travelBookHtml(state,{dates:[],items:[]},[],{essentials:saved})).includes('100V'));}
  assert.equal(await count(id),1);assert.equal(work.calls.length,1);
 });
 await t.test('Provider error and actual fetch timeout each consume one attempt; further failures are blocked',async()=>{
  const id=await owner(),state=await trip(id),error=requests('error'),timeout=requests('timeout');
  assert((await refresh(state,'RO',error)).updateFailed);assert.equal(error.calls.length,1);assert.equal(await count(id),1);
  assert((await refresh(state,'MD',timeout)).updateFailed);assert.equal(timeout.calls.length,1);assert.equal(await count(id),2);
  assert.equal((await refresh(state,'PA',error)).code,'ESSENTIALS_DAILY_LIMIT');assert.equal(error.calls.length,1);
 });
 await t.test('Duplicate same-context work shares one provider request and one persisted attempt',async()=>{
  const id=await owner(),state=await trip(id),work=requests();const [first,duplicate]=await Promise.all([refresh(state,'RO',work),refresh(state,'RO',work)]);
  assert.equal(first.generationId,duplicate.generationId);assert.equal(work.calls.length,1);assert.equal(await count(id),1);
 });
 await t.test('Concurrent independent Node workers cannot exceed the trip limit',async()=>{
  const id=await owner(),state=await trip(id);const results=await Promise.all(Array.from({length:5},()=>worker(id,state.trip.id,true)));
  assert.equal(results.filter(value=>value.allowed).length,2);assert.equal(results.filter(value=>value.code==='ESSENTIALS_DAILY_LIMIT').length,3);assert.equal(await count(id),2);
 });
 await t.test('Expired exact rolling window allows an explicit update and retains the old guide until then',async()=>{
  const id=await owner(),state=await trip(id),work=requests();await refresh(state,'RO',work);await refresh(state,'MD',work);
  const old=Date.now()-ESSENTIALS_WINDOW_MS-1000,stamp=String(old).padStart(13,'0');
  await pool.execute("UPDATE usage_counters SET bucket=CONCAT(?,SUBSTRING(bucket,14)) WHERE scope=? AND operation LIKE 'essentials-update:%'",[stamp,id]);
  await pool.execute("UPDATE trip_essentials_snapshots SET snapshot=JSON_SET(snapshot,'$.generatedAt',?) WHERE owner_id=?",[new Date(old).toISOString(),id]);
  assert((await savedEssentials(state,'RO')).countries[0].sections.find(section=>section.key==='power').facts.length);assert.equal(work.calls.length,2);
  assert.equal((await accounting.read(id,state.trip.id)).remaining,2);await refresh(state,'RO',work,{now:Date.now()+60001});assert.equal(work.calls.length,3);assert.equal(await count(id),1);
 });
 await t.test('Twenty attempts across ten trips reach the independent account ceiling',async()=>{
  const id=await owner(),work=requests();for(let i=0;i<10;i++){const state=await trip(id);await refresh(state,'MD',work);await refresh(state,'RO',work);}
  const next=await trip(id),blocked=await refresh(next,'RO',work);assert.equal(blocked.code,'ESSENTIALS_DAILY_LIMIT');assert.equal(blocked.updates.tripRemaining,2);assert.equal(blocked.updates.userRemaining,0);assert.equal(work.calls.length,20);assert.equal(await count(id),20);
  const other=await owner(),otherState=await trip(other);assert.equal((await accounting.read(other,otherState.trip.id)).remaining,2);
 });
 await t.test('Unconfigured provider, cleared passport and cancelled pre-fetch work consume zero attempts',async()=>{
  const id=await owner(),state=await trip(id);
  await refreshEssentials(state,'RO',{...quiet,accounting,retrieve:(context,options)=>retrieveEssentials(context,{...options,...quiet,configured:false})});assert.equal(await count(id),0);
  await savedEssentials(state,null);assert.equal(await count(id),0);
  const controller=new AbortController();let calls=0;
  await assert.rejects(()=>provider('responses',{},()=>{calls++;},5000,{signal:controller.signal,beforeRequest:async signal=>{const permit=await accounting.reserve(id,state.trip.id,signal);controller.abort();return permit;}}));
  assert.equal(calls,0);assert.equal(await count(id),0);
  await assert.rejects(()=>accounting.reserve(id,randomUUID()),error=>error.status===404);assert.equal(await count(id),0);
 });
 await t.test('Successful partial guides are fresh for 24h; unavailable sections do not trigger repeated paid calls',async()=>{
  const id=await owner(),state=await trip(id),work=requests('partial');const first=await refresh(state,'RO',work);assert.equal(first.generation.status,'partial');
  assert((await refresh(state,'RO',work,{now:Date.now()+3600000})).updateSkipped);assert.equal(work.calls.length,1);assert.equal(await count(id),1);
 });
 await t.test('Countdown uses dynamically calculated remaining minutes',()=>{
  const now=Date.parse('2026-10-07T00:00:00Z'),until=new Date(now+(14*60+22)*60000).toISOString();assert.match(essentialsWaitMessage(until,now),/14h 22m/);assert.match(essentialsWaitMessage(until,now+60000),/14h 21m/);assert.match(essentialsWaitMessage(until,now+ESSENTIALS_WINDOW_MS),/again now/);
 });
 await t.test('Concurrent account-wide reservations across different trips cannot exceed twenty',async()=>{
  const id=await owner();for(let i=0;i<19;i++){const state=await trip(id);await accounting.reserve(id,state.trip.id);}
  const states=await Promise.all(Array.from({length:3},()=>trip(id))),results=await Promise.all(states.map(state=>worker(id,state.trip.id,true)));
  assert.equal(results.filter(result=>result.allowed).length,1);assert.equal(results.filter(result=>result.code==='ESSENTIALS_DAILY_LIMIT').length,2);assert.equal(await count(id),20);
 });
});
