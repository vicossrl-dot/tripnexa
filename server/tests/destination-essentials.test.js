import test from 'node:test';
import assert from 'node:assert/strict';
import {essentialsContext,refreshEssentials,savedEssentials,essentialsHash} from '../premium-travel/essentials.js';
import {retrieveEssentials,verifyBriefEvidence,evidenceMatches} from '../premium-travel/essentials-provider.js';
import {permitsAi,validFact} from '../premium-travel/essentials-policy.js';
import {essentialsPdfHtml} from '../premium-travel/essentials-pdf.js';
import {travelBookHtml} from '../premium-travel/travel-book.js';
import {timezoneFacts} from '../premium-travel/essentials-time.js';
import {pool} from '../db.js';
import {provider} from '../ai.js';
import {providerError} from '../provider-errors.js';
import {requestContext} from '../request-context.js';
import {travelBriefFormat} from '../premium-travel/essentials-generation.js';
import Ajv from 'ajv';
import {essentialsState,guideCall,guideFor,guideValues,practicalResponse,memorySnapshots,officialFixture,officialUrls} from './essentials-fast-fixture.mjs';
import {visibleEssentialsSections,verifiedTravelNotices,requiredPracticalKeys,essentialsGuideVersion,essentialsUpdateMessage} from '../../src/lib/essentials-guidance.js';
test.after(()=>pool.end());
const quiet={log:()=>{}},section=(data,key)=>data.countries[0].sections.find(value=>value.key===key);
const scenario=name=>({state:{...essentialsState,trip:{...essentialsState.trip,id:name}},db:memorySnapshots()});
const retrieve=call=>context=>retrieveEssentials(context,{configured:true,call,...quiet});
const text=(data,key)=>section(data,key).facts.map(fact=>fact.text).join(' ');

test('One Responses request with bounded grouped search and named sections receives only safe trip context',async()=>{
 const state=structuredClone(essentialsState);state.tripItems=[{category:'stay',country:'Italy',city:'Rome',address:'PRIVATE_ADDRESS',confirmation_number:'PRIVATE_CONFIRMATION'}];let calls=0;
 const result=await retrieveEssentials(essentialsContext(state,'MD'),{configured:true,...quiet,call:async(path,body,_fetch,timeout)=>{
  calls++;assert.equal(path,'responses');assert.equal(body.store,false);assert.deepEqual(body.tools,[{type:'web_search',search_context_size:'low'}]);assert.equal(body.max_tool_calls,2);assert.equal(timeout,45000);
  assert.equal(body.text.format.strict,true);assert.equal(body.max_output_tokens,16000);assert.equal(body.tool_choice,'auto');assert(body.include.includes('web_search_call.action.sources'));assert(!JSON.stringify(body).includes('PRIVATE_'));
  const input=JSON.parse(body.input);assert.equal(input.tripDurationDays,4);assert.equal(input.requestedSections,undefined);assert.equal(input.repair,undefined);
  for(const code of input.countries)for(const key of ['money','power','connectivity','transport','customs','phrases','critical','entryDocuments','emergency','legal','notice'])assert(body.text.format.schema.properties.countries.properties[code].required.includes(key));
  return guideCall(path,body);
 }});
 assert.equal(calls,1);assert.equal(result.generationCalls,1);assert.equal(result.countries.length,2);assert.equal(result.verification.status,'unavailable');
});
test('Japan/Romania and Japan/Moldova have concrete power, transport, customs and structured traveler phrases',async()=>{
 for(const passport of ['RO','MD']){
  const {state,db}=scenario('kyoto-'+passport);let calls=0;
  const result=await refreshEssentials(state,passport,{db,...quiet,retrieve:retrieve(async(...args)=>{calls++;return guideCall(...args);})});
  assert.equal(calls,1);assert.equal(result.generation.status,'complete');assert.equal(result.version,essentialsGuideVersion);
  assert.match(text(result,'power'),/Type A\/B.*100V.*Kyoto.*60Hz.*50Hz/);assert.match(text(result,'power'),/100–240V.*220–240V.*converter/);
  assert.match(text(result,'connectivity'),/four-day Kyoto/);assert.match(text(result,'transport'),/Kyoto.*subway.*JR.*ICOCA/);assert.match(text(result,'transport'),/Fushimi Inari.*buses/);assert.match(text(result,'transport'),/Approximate fare/);
  assert.match(text(result,'customs'),/Tipping.*not expected.*chopsticks/);assert.equal(section(result,'customs').facts.length,8);assert.equal(section(result,'phrases').facts.length,6);
  assert.equal(section(result,'phrases').facts[0].localScript,'こんにちは');assert.equal(section(result,'phrases').facts[0].meaning,'Hello');
  assert.match(text(result,'timezone'),/Japan Standard Time.*JST.*UTC\+09:00/);assert(!text(result,'timezone').includes('ahead'),'Passport is not origin');
  const saved=await savedEssentials(state,passport,db);assert.deepEqual(section(saved,'phrases').facts,section(result,'phrases').facts);
  assert.equal(visibleEssentialsSections(saved.countries[0]).length,10);assert(!JSON.stringify(saved).includes('AI general guidance'));
 }
});
test('Missing/rejected low-risk facts do not cause repairs or repeated generic error cards',async()=>{
 let calls=0;const context=essentialsContext(essentialsState,'RO');
 const result=await retrieveEssentials(context,{configured:true,...quiet,call:async()=>{
  calls++;const guide=structuredClone(guideValues);guide.transport={systems:null,payment:null,recommendations:null,fares:null};guide.connectivity.activation={text:'Check with your carrier.'};guide.critical={facts:[]};guide.phrases={phrases:[]};return practicalResponse({JP:guide});
 }});
 assert.equal(calls,1);assert(!visibleEssentialsSections(result.countries[0]).some(value=>['transport','critical','phrases'].includes(value.key)));assert.equal(section(result,'connectivity').facts.length,2);
 const {state,db}=scenario('partial-guide');const saved=await refreshEssentials(state,'RO',{db,...quiet,retrieve:async()=>result});
 assert.equal(saved.generation.status,'partial');assert(!essentialsUpdateMessage(saved).includes('already up to date'));
 const html=essentialsPdfHtml(state.trip,saved);assert(!html.includes("couldn&#39;t prepare this section yet"));assert(!html.includes('Check with your carrier'));assert(html.includes('100V'));
});
test('High-risk AI and misplaced claims remain rejected while concrete ordinary guidance survives',()=>{
 for(const [key,value]of [['entryDocuments','Visa-free for 90 days.'],['emergency','Call 119.'],['safety','No vaccinations required.'],['transport','Moldovan citizens can stay 90 days.'],['money','You may stay for 90 days.'],['customs','Alcohol is legal everywhere.'],['water','Tap water is safe to drink.'],['critical','112 works throughout the country.'],['customs','Alcohol is allowed from age 20.'],['transport','Stay for ninety days without further checks.'],['critical','Tax-free shopping requires customs registration.']])assert.equal(permitsAi(key,value),false,value);
 for(const value of ['respect local customs','Check local transport options.','carry essentials','Check with your carrier.','Wi-Fi may be available.','Tipping varies.'])assert.equal(permitsAi('customs',value),false,value);
 assert(permitsAi('power','Japan commonly uses Type A plugs and 100V electricity.'));
 assert(permitsAi('power','Electricity is typically 100V; check your charger label.'));
 assert.equal(validFact({text:'Visa-free for 90 days.',sourceType:'official',sourceUrl:officialUrls.entry},'entryDocuments','JP'),null);
});
test('Same-request official candidates require searched URLs and actual page evidence; paraphrases are never displayed',async()=>{
 for(const passport of ['MD','RO']){
  const fixture=officialFixture(passport);let calls=0,pages=0,active=0,maxActive=0;
  const result=await retrieveEssentials(essentialsContext(essentialsState,passport),{configured:true,...quiet,call:async()=>{calls++;return practicalResponse({JP:fixture.guide},[...fixture.pages.keys()]);},readPage:async url=>{
   pages++;active++;maxActive=Math.max(active,maxActive);await new Promise(resolve=>setTimeout(resolve,5));active--;return {url,html:'<p>'+fixture.pages.get(url)+'</p>'};
  }});
  assert.equal(calls,1);assert.equal(pages,3);assert.equal(maxActive,3);assert.equal(result.verification.status,'complete');
  assert.equal(text(result,'entryDocuments'),fixture.evidence);assert(!text(result,'entryDocuments').includes('Unsupported model paraphrase'));assert.match(text(result,'emergency'),/Police 110.*119/);
  assert.equal(section(result,'entryDocuments').facts[0].sourceType,'official');assert(section(result,'entryDocuments').facts[0].verifiedAt);assert.equal(verifiedTravelNotices(result.countries[0]).length,1);
  assert(evidenceMatches('<p>'+fixture.evidence+'</p>',fixture.evidence));
 }
});
test('Wrong nationality, invented/UGC/trusted URLs and redirected nonofficial pages cannot verify critical facts',async()=>{
 const fixture=officialFixture('MD'),context=essentialsContext(essentialsState,'RO');
 const mismatch=await verifyBriefEvidence(context,{JP:{entryDocuments:fixture.guide.entryDocuments}},practicalResponse({},[officialUrls.entry]),{readPage:()=>{throw Error('Must not read wrong nationality');}});assert.deepEqual(mismatch.countries,[]);
 for(const sourceUrl of ['https://private.invalid/','https://www.iec.ch/world-plugs','https://www.mofa.go.jp/forum/entry',officialUrls.entry]){
  const guide={JP:{entryDocuments:{facts:[{sourceUrl,evidence:fixture.evidence}]}}};
  const checked=await verifyBriefEvidence(essentialsContext(essentialsState,'MD'),guide,practicalResponse({},sourceUrl===officialUrls.entry?[]:[sourceUrl]),{readPage:()=>{throw Error('Must not read rejected URL');}});assert.deepEqual(checked.countries,[]);
 }
 const redirected=await verifyBriefEvidence(essentialsContext(essentialsState,'MD'),{JP:{entryDocuments:fixture.guide.entryDocuments}},practicalResponse({},[officialUrls.entry]),{readPage:async()=>({url:'https://private.invalid/',html:fixture.evidence})});assert.deepEqual(redirected.countries,[]);
});
test('Universal passport/form excerpts are allowed only for all foreign visitors without exceptions',async()=>{
 const context=essentialsContext(essentialsState,'RO'),url=officialUrls.entry;
 for(const [evidence,expected] of [['All foreign visitors must present a passport valid for their intended stay in Japan.',1],['All foreign visitors should complete the official Japan arrival registration before arrival.',1],['All foreign visitors except Romanian citizens follow this Japan entry rule.',0]]){
  const result=await verifyBriefEvidence(context,{JP:{entryDocuments:{facts:[{evidence,sourceUrl:url}]}}},practicalResponse({},[url]),{readPage:async()=>({url,html:evidence})});assert.equal(result.countries.length,expected);
 }
 const clear=await verifyBriefEvidence({...context,travelerPassportCountry:null},{JP:{entryDocuments:{facts:[{evidence:'All foreign visitors must present a passport valid for their intended stay in Japan.',sourceUrl:url}]}}},practicalResponse({},[url]),{readPage:()=>{throw Error('Entry is not retrieved for cleared passport');}});assert.deepEqual(clear.countries,[]);
});
test('Page/search failure and sensible deadlines never retry or discard the useful practical brief',async()=>{
 const fixture=officialFixture();let calls=0;
 const result=await retrieveEssentials(essentialsContext(essentialsState,'MD'),{configured:true,...quiet,pageTimeoutMs:20,call:async()=>{calls++;return practicalResponse({JP:fixture.guide},[...fixture.pages.keys()]);},readPage:()=>new Promise(()=>{})});
 assert.equal(calls,1);assert.equal(result.verification.status,'unavailable');assert.match(text(result,'power'),/100V/);assert(!text(result,'emergency').includes('119'));
 const missing=await verifyBriefEvidence(essentialsContext(essentialsState,'MD'),{JP:{emergency:fixture.guide.emergency}},practicalResponse({},[officialUrls.emergency]),{readPage:async()=>({url:officialUrls.emergency,html:'No supporting numbers here.'})});assert.deepEqual(missing.countries,[]);
 let timedCalls=0;const began=Date.now(),failed=await retrieveEssentials(essentialsContext(essentialsState,'MD'),{configured:true,...quiet,timeoutMs:20,call:()=>{timedCalls++;return new Promise(()=>{});}});assert.equal(timedCalls,1);assert.equal(failed.guidanceStatus,'failed');assert(Date.now()-began<1000);
 assert.equal((await retrieveEssentials(essentialsContext(essentialsState,'MD'),{configured:false,...quiet})).generationCalls,0);
});
test('Optional notice needs official, serious, date-relevant evidence and disappears outside its period',async()=>{
 const fixture=officialFixture(),context=essentialsContext(essentialsState,'MD'),url=officialUrls.notice;
 const run=(guide,ctx=context)=>verifyBriefEvidence(ctx,{JP:{notice:guide}},practicalResponse({},[url]),{readPage:async()=>({url,html:fixture.notice})});
 assert.equal((await run(fixture.guide.notice)).countries.length,1);
 assert.equal((await run(fixture.guide.notice,{...context,startDate:'2026-11-01',endDate:'2026-11-03'})).countries.length,0);
 const wrong=structuredClone(fixture.guide.notice);wrong.facts[0].appliesThrough='2027-10-09';assert.equal((await run(wrong)).countries.length,0);
 const generic=structuredClone(fixture.guide.notice);generic.facts[0].evidence='Japan: consult a doctor and keep belongings safe from 6 October 2026 to 9 October 2026.';assert.equal((await run(generic)).countries.length,0);
 const absent=await guideFor();assert.equal(verifiedTravelNotices(absent.countries[0]).length,0);
 const checked=await run(fixture.guide.notice),fact=checked.countries[0].sections[0].facts[0];assert.equal(validFact({...fact,verifiedAt:new Date(Date.now()-86400001).toISOString()},'notice','JP'),null);
});
test('Origin prefers reliable inbound transport, never nationality/destination departure; date-specific DST is calculated',()=>{
 const state=structuredClone(essentialsState);state.trip.origin_country='RO';state.trip.origin_timezone='Europe/Bucharest';state.tripItems=[{category:'flight',arrival_datetime:'2026-10-06T08:00',arrival_timezone:'Asia/Tokyo',departure_timezone:'Europe/Chisinau',traveler:'PRIVATE_TRAVELER',confirmation_number:'PRIVATE_CONFIRMATION'}];
 const context=essentialsContext(state,'RO');assert.equal(context.originCountry,'MD');assert.equal(context.originCity,null);assert.equal(context.originTimezone,'Europe/Chisinau');assert(!JSON.stringify(context).includes('PRIVATE_'));
 const facts=timezoneFacts(context).map(fact=>fact.text).join(' ');assert.match(facts,/6 hours ahead of Moldova/);assert.match(facts,/09:00 there → 15:00/);
 const dst=timezoneFacts({...context,startDate:'2026-10-24',endDate:'2026-10-27'}).map(fact=>fact.text).join(' ');assert.match(dst,/6 hours ahead/);assert.match(dst,/7 hours ahead/);assert.match(dst,/16:00/);assert.match(dst,/daylight-saving/);
 const unknown=essentialsContext({...essentialsState,trip:{...essentialsState.trip,departure_country:'Japan'}},'MD');assert.equal(unknown.originCountry,null);assert.equal(unknown.originTimezone,null);assert(timezoneFacts(unknown).every(fact=>!fact.text.includes('ahead')));assert(timezoneFacts(unknown).some(fact=>fact.text.includes('Add your departure city')));
 const explicit=essentialsContext({...essentialsState,trip:{...essentialsState.trip,origin_country:'RO'}},'MD');assert.equal(explicit.originTimezone,'Europe/Bucharest');
});
test('Saved guide, modal reads, cooldown and both PDF renderers reuse snapshots with no generation',async()=>{
 const {state,db}=scenario('snapshot-reuse');let calls=0;const options={db,...quiet,retrieve:retrieve(async(...args)=>{calls++;return guideCall(...args);})};
 const [first,duplicate]=await Promise.all([refreshEssentials(state,'MD',options),refreshEssentials(state,'MD',options)]);assert.equal(calls,1);assert.equal(first.generationId,duplicate.generationId);
 for(let i=0;i<2;i++){
  const saved=await savedEssentials(state,'MD',db),html=essentialsPdfHtml(state.trip,saved),book=await travelBookHtml(state,{dates:[],items:[]},[],{essentials:saved});
  for(const label of ['こんにちは','ICOCA','100V','Official authorities &amp; sources','About this information','Moldova'])assert(html.includes(label),label);
  assert(book.includes('ICOCA'));assert(!html.includes('PRIVATE_'));assert.equal(calls,1);
 }
 assert((await refreshEssentials(state,'MD',options)).updateSkipped);assert.equal(calls,1);
 const clear=await savedEssentials(state,null,db);assert.match(text(clear,'entryDocuments'),/Choose your passport country/);assert.equal(calls,1);
 await refreshEssentials(state,'MD',{...options,now:Date.now()+86400001});assert.equal(calls,2);
});
test('Passport hashes are independent and failure preserves prior useful content/update time',async()=>{
 const {state,db}=scenario('failure-retention');let calls=0;const options={db,...quiet,retrieve:retrieve(async(...args)=>{calls++;return guideCall(...args);})};
 await refreshEssentials(state,'MD',options);await refreshEssentials(state,'RO',options);assert.equal(calls,2);
 const prior=await savedEssentials(state,'MD',db),failed=await refreshEssentials(state,'MD',{db,...quiet,now:Date.now()+86400001,retrieve:retrieve(async()=>{calls++;throw Error('PRIVATE_PROVIDER_BODY');})});
 assert.equal(calls,3);assert(failed.updateFailed);assert.equal(failed.generatedAt,prior.generatedAt);assert.equal(text(failed,'power'),text(prior,'power'));assert(!JSON.stringify(failed).includes('PRIVATE_PROVIDER_BODY'));
 assert((await refreshEssentials(state,'MD',{...options,now:Date.now()+86400002})).retryBlocked);assert.equal(calls,3);
 assert(db.sql.filter(value=>value.query.startsWith('SELECT')).every(value=>value.params[0]===state.trip.id&&value.params[1]===state.ownerId));
});
test('Initial provider/refusal/schema failure has one attempt, no success timestamp and no repetitive unavailable cards',async()=>{
 for(const [name,call] of [['outage',async()=>{throw Error('offline');}],['refusal',async()=>({output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]})],['incomplete',async()=>({status:'incomplete',output:[]})]]){
  const {state,db}=scenario('failed-'+name);let calls=0;const result=await refreshEssentials(state,'RO',{db,...quiet,retrieve:retrieve(async(...args)=>{calls++;return call(...args);})});
  assert.equal(calls,1);assert.equal(result.generatedAt,null);assert.equal(result.generation.status,'failed');assert(result.updateFailed);assert(!essentialsUpdateMessage(result).includes('already up to date'));assert(!visibleEssentialsSections(result.countries[0]).some(value=>value.key==='power'));
  const again=await refreshEssentials(state,'RO',{db,...quiet,retrieve:retrieve(guideCall)});assert(again.retryBlocked);assert.equal(calls,1);
 }
});
test('A late whole-brief result cannot overwrite a newer saved generation',async()=>{
 const {state,db}=scenario('generation-race');await refreshEssentials(state,'RO',{db,...quiet,retrieve:retrieve(guideCall)});
 const hash=essentialsHash(essentialsContext(state,'RO')),row=db.rows.get(hash);let resolve;
 const work=refreshEssentials(state,'RO',{db,...quiet,now:Date.now()+86400001,retrieve:()=>new Promise(done=>resolve=done)});
 while(!resolve)await new Promise(done=>setImmediate(done));row.snapshot.generationId='newer-success';resolve(await guideFor(state,'RO'));const result=await work;
 assert(result.updateConflict);assert.equal(result.generationId,'newer-success');assert.equal(db.rows.get(hash).snapshot.generationId,'newer-success');
});
test('Legacy v2/v3/v4 contexts restore without writes/calls and upgrade only on explicit update',async()=>{
 for(const version of [2,3,4]){
  const {state,db}=scenario('legacy-'+version),context=essentialsContext(state,'RO');
  const legacy={countries:context.countries,travelerPassportCountry:'RO',startDate:context.startDate,endDate:context.endDate,guideVersion:version,...(version>2?{primaryCountry:'JP'}:{}),cities:['Kyoto'],originCountry:null,...(version>2?{originTimezone:null}:{}),currency:'JPY',timezone:'Asia/Tokyo',transportModes:[],...(version>2?{itinerary:context.itinerary}:{})};
  db.rows.set(essentialsHash(legacy),{checked_at:new Date(),snapshot:{version,guideVersion:version,generatedAt:new Date().toISOString(),generationId:'legacy',countries:[{code:'JP',sections:[{key:'power',facts:[{text:'Japan uses Type A/B plugs and 100V electricity.',sourceType:'ai_general'}]},{key:'rules',facts:[{text:'Never stand chopsticks upright in rice in Japan.',sourceType:'ai_general'}]},{key:'safety',facts:[{text:'Consult a doctor.',sourceType:'ai_general'}]}]}]}});
  const restored=await savedEssentials(state,'RO',db);assert.equal(restored.generationId,'legacy');assert.equal(restored.generation.current,false);assert.match(text(restored,'power'),/100V/);assert.match(text(restored,'customs'),/chopsticks/);assert(!visibleEssentialsSections(restored.countries[0]).some(value=>value.key==='safety'));assert(db.sql.every(value=>value.query.startsWith('SELECT')));
  let calls=0;const updated=await refreshEssentials(state,'RO',{db,...quiet,retrieve:retrieve(async(...args)=>{calls++;return guideCall(...args);})});assert.equal(calls,1);assert.equal(updated.version,5);assert.equal(updated.generation.status,'complete');
 }
});
test('Legal evidence supplements etiquette without crowding it; official and AI provenance stay separate in PDFs',async()=>{
 const fixture=officialFixture('RO');fixture.guide.legal.facts=[{evidence:'Fixture-only official Japan rule: comply with the applicable local registration requirement.',sourceUrl:officialUrls.entry}];fixture.pages.set(officialUrls.entry,fixture.evidence+' '+fixture.guide.legal.facts[0].evidence);
 const {state,db}=scenario('legal-provenance'),result=await refreshEssentials(state,'RO',{db,...quiet,retrieve:context=>retrieveEssentials(context,{configured:true,...quiet,call:async()=>practicalResponse({JP:fixture.guide},[...fixture.pages.keys()]),readPage:async url=>({url,html:fixture.pages.get(url)})})});
 assert.equal(section(result,'customs').facts.filter(fact=>fact.sourceType==='ai_general').length,8);assert.equal(section(result,'customs').facts.filter(fact=>fact.sourceType==='official').length,1);
 const html=essentialsPdfHtml(state.trip,result),book=await travelBookHtml(state,{dates:[],items:[]},[],{essentials:result});
 for(const value of ['✓ Verified','Official source','https://www.mofa.go.jp/j_info/visit/visa/index.html']){assert(html.includes(value));assert(book.includes(value));}
 assert(!html.includes('AI general guidance'));assert(html.includes('chopsticks'));assert(book.includes('Official authorities &amp; sources'));
});

test('Nullable sections satisfy the provider schema; malformed nested sections cannot discard other usable content',async()=>{
 const partial=structuredClone(guideValues);partial.connectivity=null;partial.critical=null;
 const validate=new Ajv({strict:false}).compile(travelBriefFormat(['JP']).schema);
 assert(validate({countries:{JP:partial}}),JSON.stringify(validate.errors));
 partial.connectivity={options:{text:42},activation:null};partial.power.compatibility='malformed';partial.customs.facts.push(null);
 const logs=[],result=await retrieveEssentials(essentialsContext(essentialsState,'RO'),{configured:true,call:async()=>practicalResponse({JP:partial}),log:line=>logs.push(line)});
 assert.equal(result.guidanceStatus,'ai_generated');assert.match(text(result,'money'),/yen/);assert.match(text(result,'power'),/100V/);assert.match(text(result,'transport'),/ICOCA/);assert.equal(section(result,'phrases').facts.length,6);
 assert.equal(section(result,'connectivity').facts.length,0);assert(!logs.some(line=>line.includes('parse failure')));
});

test('A failed search tool or incomplete response with usable JSON preserves ordinary guidance without official claims',async()=>{
 for(const status of ['completed','incomplete','failed']){
  let calls=0;const fixture=officialFixture(),response=practicalResponse({JP:fixture.guide},[...fixture.pages.keys()]);response.status=status;response.output[0].status='failed';
  const result=await retrieveEssentials(essentialsContext(essentialsState,'MD'),{configured:true,...quiet,call:async()=>{calls++;return response;},readPage:()=>{throw Error('Failed search cannot authorize evidence');}});
  assert.equal(calls,1);assert.equal(result.guidanceStatus,'ai_generated');assert.match(text(result,'power'),/100V/);assert.match(text(result,'transport'),/ICOCA/);assert.equal(result.verification.status,'unavailable');assert(!result.countries[0].sections.flatMap(section=>section.facts).some(fact=>fact.verifiedAt));
 }
});

test('Real Responses envelopes distinguish refusal, truncation, invalid JSON, missing roots and SDK output_text',async()=>{
 const cases=[
  [{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'PRIVATE_REFUSAL'}]}]},'refusal'],
  [{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},output_text:'{"countries":{"JP":'},'truncated'],
  [{status:'completed',output_text:'PRIVATE_INVALID_BODY'},'invalid_json'],
  [{status:'completed',output_text:'{}'},'missing_required_root'],
  [{status:'completed',output_text:'{"countries":{"JP":null}}'},'schema_mismatch'],
  [{status:'completed',output:[]},'empty_output']
 ];
 for(const [response,reason] of cases){
  const logs=[],result=await retrieveEssentials(essentialsContext(essentialsState,'RO'),{configured:true,call:async()=>response,log:line=>logs.push(line)});
  assert.equal(result.guidanceStatus,'failed');assert(logs.some(line=>line.includes('"reason":"'+reason+'"')));assert(!logs.join('').includes('PRIVATE_'));
 }
 const result=await retrieveEssentials(essentialsContext(essentialsState,'RO'),{configured:true,...quiet,call:async()=>({status:'completed',output_text:JSON.stringify({countries:{JP:guideValues}})})});assert.match(text(result,'power'),/100V/);
});

test('Safe primary diagnostics retain HTTP codes and timeout classification without provider bodies or identity',async()=>{
 const previous=console.error;console.error=()=>{};
 try{
  const logs=[],failure=providerError('OpenAI',{status:400,code:'invalid_json_schema',cause:Error('PRIVATE_KEY_PROMPT'),requestId:'fixture-request'});
  const result=await retrieveEssentials(essentialsContext(essentialsState,'RO'),{configured:true,call:async()=>{throw failure;},log:line=>logs.push(line)});
  assert.equal(result.generationCalls,1);assert(logs.some(line=>line.includes('"status":400')&&line.includes('invalid_json_schema')));assert(!logs.join('').includes('PRIVATE_'));assert(!JSON.stringify(failure).includes('providerFailure'));
  let aborted=false,work;const timed=[];
  await retrieveEssentials(essentialsContext(essentialsState,'RO'),{configured:true,timeoutMs:20,log:line=>timed.push(line),call:(path,body,_fetch,timeout,options)=>(work=provider(path,body,async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true})),timeout,options))});
  await work.catch(()=>{});
  assert(aborted);assert(timed.some(line=>line.includes('primary timeout')&&line.includes('"timeoutMs":20')));
 }finally{console.error=previous;}
});

test('An expired failed v5 snapshot allows exactly one fresh explicit update and is replaced without deletes',async()=>{
 const {state,db}=scenario('expired-failed-v5');let calls=0;const began=Date.now();
 const failed=await refreshEssentials(state,'RO',{db,...quiet,now:began,retrieve:retrieve(async()=>{calls++;throw Error('offline');})});
 assert.equal(failed.version,5);assert.equal(failed.generation.status,'failed');assert.equal(failed.generatedAt,null);
 const restored=await savedEssentials(state,'RO',db);assert.equal(restored.generation.status,'failed');assert.equal(calls,1);
 const recovered=await refreshEssentials(state,'RO',{db,...quiet,now:began+60001,retrieve:retrieve(async(...args)=>{calls++;return guideCall(...args);})});
 assert.equal(calls,2);assert.equal(recovered.generation.status,'complete');assert(!recovered.updateFailed);assert(recovered.generatedAt);assert.notEqual(recovered.generationId,failed.generationId);assert.match(text(await savedEssentials(state,'RO',db),'power'),/100V/);assert(!db.sql.some(value=>value.query.startsWith('DELETE')));
});

test('Request-local model and shorter admin timeout are reflected in safe diagnostics; old wrapper callers still work',async()=>{
 const logs=[];
 await requestContext.run({settings:{settings:{text_model:'configured-admin-model',ai_timeout_seconds:10}}},()=>retrieveEssentials(essentialsContext(essentialsState,'RO'),{configured:true,log:line=>logs.push(line),call:async(path,body,_fetch,timeout)=>{
  assert.equal(body.model,'configured-admin-model');assert.equal(body.max_output_tokens,10000);assert.equal(timeout,10000);return guideCall(path,body);
 }}));
 assert(logs.some(line=>line.includes('"timeoutMs":10000')&&line.includes('configured-admin-model')));
 let fetched=0;const response=await provider('responses',{model:'fixture'},async(_url,{signal})=>{fetched++;assert(!signal.aborted);return {ok:true,status:200,headers:new Headers(),json:async()=>({status:'completed',output:[]})};},50);
 assert.equal(response.status,'completed');assert.equal(fetched,1);
 const old=console.error;console.error=()=>{};
 try{const controller=new AbortController();controller.abort();await assert.rejects(()=>provider('responses',{},()=>{assert.fail('Cancelled work must not start a fetch');},50,{signal:controller.signal}),error=>error.status===502);}finally{console.error=old;}
});
