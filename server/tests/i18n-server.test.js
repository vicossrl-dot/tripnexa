import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {requestContext} from '../request-context.js';
import {serverLocale,requestLocale,serverMessage,serverCount,localeInstruction,localizedErrors,supportedLocales} from '../i18n.js';
import {provider,strictSchema,generateTripNames,validateTripNames} from '../ai.js';
import {config} from '../config.js';
import {pool} from '../db.js';
import {generatedTexts,translateSavedTexts,translationKey,recordModelLocale} from '../localized-content.js';
import {authenticationEmail} from '../auth-emails.js';
import {itineraryHtml} from '../itinerary-pdf.js';
import {essentialsPdfHtml,printableEssentials} from '../premium-travel/essentials-pdf.js';
import {travelBookHtml} from '../premium-travel/travel-book.js';
import {pdfFontCss,withPdfTranslations} from '../pdf-i18n.js';
import {serverCatalogs} from '../../src/i18n/server-messages.js';
import {execFileSync} from 'node:child_process';
import {selectLocale,acknowledgeLocale,translateText} from '../../src/i18n/runtime.js';
import {calendarIcs} from '../premium-travel/calendar.js';
import {essentialsContext} from '../premium-travel/essentials.js';
import {retrieveEssentials} from '../premium-travel/essentials-provider.js';
import {travelBriefFormat} from '../premium-travel/essentials-generation.js';
import {essentialsState,guideCall} from './essentials-fast-fixture.mjs';
import {localizeMealOptions} from '../meal-options.js';

test.after(()=>pool.end());
const response=value=>({ok:true,status:200,headers:new Headers(),json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]})});
const localeRequest=(headers={},user={},query={},originalUrl='/api/trips/id')=>({originalUrl,user,query,get:name=>headers[name]});
test('user-facing server copy and shared-trip copy have catalog keys across all six locales',()=>{
 assert.match(execFileSync(process.execPath,['scripts/audit-server-i18n.mjs'],{encoding:'utf8'}),/no missing keys/);
});
test('already displayed localized server errors can switch language without losing field values',()=>{
 const source='start_date is required.';
 const old=serverMessage(source,'ru');selectLocale('fr');assert.equal(translateText(old),serverMessage(source,'fr'));
 assert.equal(translateText(serverMessage('Incorrect email or password.','de')),serverMessage('Incorrect email or password.','fr'));
 selectLocale('en');acknowledgeLocale('en');
});
test('server locale precedence, regional browser fallback and Admin isolation are request scoped',async()=>{
 await Promise.all(supportedLocales.map(locale=>requestContext.run({},async()=>{
  requestLocale(localeRequest({'X-TripNexa-Locale':locale,'Accept-Language':'ro'},{ui_locale:'de'}),{},()=>{});
  await Promise.resolve();assert.equal(serverLocale(),locale);
 })));
 for(const [req,expected]of [[localeRequest({}, {ui_locale:'fr'}),'fr'],[localeRequest({'Accept-Language':'it-IT, ru-RU;q=0.8'}),'ru'],[localeRequest({'X-TripNexa-Locale':'bad'}),'en'],[localeRequest({'X-TripNexa-Locale':'ru'},{},{},'/api/admin/users'),'en']])requestContext.run({},()=>{requestLocale(req,{},()=>{});assert.equal(serverLocale(),expected);});
 assert.equal(serverLocale(),'en');assert.match(localeInstruction('unknown'),/English/);
});
test('all Responses paths propagate locale without changing strict JSON contracts or evidence instructions',async t=>{
 const execute=pool.execute;pool.execute=async()=>[[]];t.after(()=>{pool.execute=execute;});
 const schema=strictSchema({type:'object',properties:{step_type:{type:'string',enum:['visit','meal','transport']},title:{type:'string'}}});
 const body={model:'fixture',instructions:'Existing instructions.',input:'{"step_type":"visit"}',text:{format:{type:'json_schema',schema}}};
 for(const locale of supportedLocales)await requestContext.run({locale},async()=>{
  await provider('responses',body,async(_url,options)=>{const sent=JSON.parse(options.body);assert.deepEqual(sent.text,body.text);assert.equal(sent.input,body.input);assert(sent.instructions.includes(localeInstruction(locale)));return response({step_type:'visit',title:'Louvre'});});
  await provider('responses',body,async(_url,options)=>{assert.deepEqual(JSON.parse(options.body),body);return response({countries:[]});},120000,{canonicalEvidence:true});
 });
 assert.equal(body.instructions,'Existing instructions.');
 await requestContext.run({locale:'en',adminLocaleRequest:true},()=>provider('responses',body,async(_url,options)=>{assert.deepEqual(JSON.parse(options.body),body);return response({ok:true});}));
});
test('offline trip-name suggestions remain validated and localized in all six languages',async t=>{
 const previous=config.aiKey;config.aiKey='';t.after(()=>{config.aiKey=previous;});
 for(const locale of supportedLocales)await requestContext.run({locale},async()=>{const result=await generateTripNames({destination:'Rome'},()=>assert.fail('Offline fallback must not invoke AI'));assert.equal(result.source,'fallback');validateTripNames(result.names);assert.equal(result.names[0],'Rome '+serverMessage('Escape'));assert.equal(result.message,serverMessage('AI suggestions are unavailable. Here are three simple ideas; you can also type your own name.'));});
});
test('Before You Go carries display locale separately and preserves the canonical evidence schema/English validator input',async()=>{
 for(const locale of supportedLocales)await requestContext.run({locale},()=>retrieveEssentials(essentialsContext(essentialsState,'MD'),{configured:true,log:()=>{},readPage:()=>assert.fail('Fixture has no official web claims'),call:async(path,body,_fetch,_timeout,options)=>{
  const input=JSON.parse(body.input);assert.equal(input.displayLocale,locale);assert.equal(options.canonicalEvidence,true);assert.match(body.instructions,/Keep canonical briefing prose in English/);assert.deepEqual(body.text.format,travelBriefFormat(input.countries));return guideCall(path,body);
 }}));
});
test('cache translates each unchanged source once, coalesces concurrency, isolates owners and invalidates on source change',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'tripnexa-i18n-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const previous=[config.aiKey,config.aiModel];config.aiKey='fixture';config.aiModel='fixture';t.after(()=>{[config.aiKey,config.aiModel]=previous;});
 let calls=0;
 const call=async(_path,body)=>{calls++;assert.equal(body.text.format.schema.additionalProperties,false);assert.deepEqual(body.text.format.schema.required,['texts']);await new Promise(resolve=>setTimeout(resolve,15));return (await response({texts:JSON.parse(body.input).texts.map(text=>'Traduit '+text)}).json());};
 const options={locale:'fr',owner:'owner-a',directory,generate:true,call};
 const source=['Museum visit 12'];
 const [a,b]=await Promise.all([translateSavedTexts(source,options),translateSavedTexts(source,options)]);assert.deepEqual(a,b);assert.equal(calls,1);
 assert.deepEqual(await translateSavedTexts(source,options),a);assert.equal(calls,1);
 const subset=await translateSavedTexts(source,{...options,generate:false,call:()=>assert.fail('PDF must not call AI')});assert.deepEqual(subset,a);
 await translateSavedTexts(['Museum visit 13'],options);assert.equal(calls,2);
 await translateSavedTexts(source,{...options,owner:'owner-b'});assert.equal(calls,3);
 assert.notEqual(translationKey(source,'fr','owner-a'),translationKey(source,'ru','owner-a'));
});
test('malformed translations and changed numbers/URLs fail closed with canonical fallback',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'tripnexa-i18n-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const previous=[config.aiKey,config.aiModel];config.aiKey='fixture';config.aiModel='fixture';t.after(()=>{[config.aiKey,config.aiModel]=previous;});
 for(const [index,texts]of [[],['Wrong 14 https://evil.test'],[''],['Correct 12 https://official.test','Extra']].entries()){
  const options={locale:'ru',owner:'owner'+index,directory,generate:true};
  const value=await translateSavedTexts(['Correct 12 https://official.test'],{...options,call:async()=>response({texts}).json()});assert.deepEqual({...value},{});
  await translateSavedTexts(['Correct 12 https://official.test'],{...options,call:()=>assert.fail('Failure cooldown must not issue repeated model calls')});
 }
 assert.deepEqual({...await translateSavedTexts(['No cached source'],{locale:'de',owner:'a',directory,generate:false,call:()=>assert.fail()})},{});
});
test('six-language switches reuse persisted unchanged translations and all PDF readers make zero model calls',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'tripnexa-six-locale-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const previous=[config.aiKey,config.aiModel];config.aiKey='fixture';config.aiModel='fixture';t.after(()=>{[config.aiKey,config.aiModel]=previous;});
 const source=['Unchanged generated description 42'],before=JSON.stringify(source),calls=new Map();
 for(let round=0;round<3;round++)for(const locale of supportedLocales){
  const options={locale,owner:'six-locale-owner',directory,generate:true,call:async(_path,body)=>{calls.set(locale,(calls.get(locale)||0)+1);return response({texts:JSON.parse(body.input).texts.map(text=>locale+' '+text)}).json();}};
  const translated=await translateSavedTexts(source,options);
  assert.equal(translated[source[0]],locale==='en'?source[0]:locale+' '+source[0]);
  assert.deepEqual(await translateSavedTexts(source,{...options,generate:false,call:()=>assert.fail('PDF download must never call AI')}),translated);
 }
 assert.equal(calls.size,5);for(const count of calls.values())assert.equal(count,1);
 assert.equal(JSON.stringify(source),before);
});
test('generated projections exclude private notes, identity and internal enum/schema values',()=>{
 const source={trip:{name:'My trip',notes:'PRIVATE'},items:[{step_type:'transport',title:'Travel to hotel',route_mode:'walk',notes:'SECRET'},{step_type:'visit',title:'Louvre'}],places:[{name:'Louvre',fit_reason:'An art highlight'}],countries:[{code:'FR',sections:[{key:'entryDocuments',facts:[{text:'Canonical fact',sourceUrl:'https://official.test',evidence:'Unchanged quote'}]}]}]};
 assert.deepEqual(generatedTexts(source),['An art highlight','Canonical fact','Travel to hotel']);
});
test('restaurant display copy localizes without changing cached canonical categories, provider names or booking identifiers',()=>{
 const source={token:'token',notice:'Distances are approximate. Check opening hours for your meal time, accessibility and dietary requirements directly with the restaurant.',restaurants:[{place_id:'google-place-id',name:'Café Louvre',category:'french restaurant',price_label:'Moderate',description:'French restaurant · Google Maps'}]},before=JSON.stringify(source);
 for(const locale of supportedLocales)requestContext.run({locale},()=>{const data=localizeMealOptions(source);assert.equal(data.token,'token');assert.equal(data.restaurants[0].name,'Café Louvre');assert.equal(data.restaurants[0].place_id,'google-place-id');assert.equal(data.restaurants[0].category,'french restaurant');assert.equal(data.restaurants[0].price_label,serverMessage('Moderate'));assert.equal(data.restaurants[0].description,serverMessage('french restaurant')+' · Google Maps');});assert.equal(JSON.stringify(source),before);
});
test('localized validation preserves field identifiers and error codes; unknown messages fall back to English',()=>{
 for(const locale of supportedLocales)requestContext.run({locale},()=>{
  const result=serverMessage('start_date is required.');assert(result.includes('start_date'));if(locale!=='en')assert.notEqual(result,'start_date is required.');
  assert.equal(serverMessage('Unknown future provider text'),'Unknown future provider text');
  let json;const res={json:body=>{json=body;return body;}};localizedErrors(localeRequest(),res,()=>{});res.json({error:'Incorrect email or password.',code:'AUTH_INVALID',status:'ACTIVE'});
  assert.equal(json.code,'AUTH_INVALID');assert.equal(json.status,'ACTIVE');assert.equal(json.error,serverCatalogs[locale]['error.credentials']);
 });
});
test('auth email subjects/text use all locales while preserving URLs, codes and 15 minute expiry',()=>{
 const urls={application:{value:'https://my.tripnexa.app'}};
 for(const locale of supportedLocales){
  const user={id:'user',email:'fixture@example.test',ui_locale:locale};
  const verified=authenticationEmail(user,'verify','123456',urls),reset=authenticationEmail(user,'reset','opaque-reset-token',urls);
  assert.equal(verified.subject,serverCatalogs[locale]['mail.verifySubject']);assert(verified.text.includes('123456'));assert(verified.text.includes('15'));assert(verified.text.includes('https://my.tripnexa.app/register?verifyEmail=fixture%40example.test'));
  assert(reset.text.includes('token=opaque-reset-token'));assert(reset.text.includes('user=user'));assert(reset.text.includes(serverCatalogs[locale]['mail.ignore']));
 }
});
test('calendar display labels localize while RFC properties, UIDs and dates remain stable',()=>{
 const trip={id:'trip',timezone:'Europe/Paris'},plan={dates:['2026-10-08'],items:[{id:'meal',step_type:'meal',title:'Lunch',date:'2026-10-08',start_time:'12:00',end_time:'13:00',meal_choice:JSON.stringify({name:'Café Louvre'})}]};
 const english=requestContext.run({locale:'en'},()=>calendarIcs(trip,plan));
 for(const locale of supportedLocales)requestContext.run({locale},()=>{const result=calendarIcs(trip,plan);assert(result.content.includes('SUMMARY:'+serverMessage('Meal')+' · Café Louvre'));for(const prefix of ['UID:','DTSTART:','DTEND:'])assert.equal(result.content.split('\r\n').find(line=>line.startsWith(prefix)),english.content.split('\r\n').find(line=>line.startsWith(prefix)));assert(result.content.includes('PRODID:-//TripNexa//Saved itinerary//EN'));});
});
test('PDF quantities use singular and Russian/Romanian plural forms',()=>{
 assert.equal(serverCount('days',1,'en'),'1 day');assert.equal(serverCount('days',2,'en'),'2 days');
 assert.equal(serverCount('days',1,'ro'),'1 zi');assert.equal(serverCount('days',2,'ro'),'2 zile');
 assert.equal(serverCount('days',1,'ru'),'1 день');assert.equal(serverCount('days',2,'ru'),'2 дня');assert.equal(serverCount('days',5,'ru'),'5 дней');
 assert.equal(serverCount('children',1,'ru'),'1 ребёнок');assert.equal(serverCount('children',2,'ru'),'2 ребёнка');assert.equal(serverCount('children',5,'ru'),'5 детей');
});
test('six PDF locales have localized labels, Intl dates, embedded offline Cyrillic font and canonical evidence validation',async()=>{
 const trip={id:'id',owner_id:'owner',name:'Private name',destination:'Louvre',start_date:'2026-10-08',end_date:'2026-10-08'};
 const state={trip,items:[],tripItems:[],places:[]},plan={dates:['2026-10-08'],items:[]};
 const snapshot={countries:[{code:'FR',country:'France',sections:[{key:'entryDocuments',title:'Entry & documents',facts:[{text:'Fabricated visa advice',sourceType:'ai_general'}]},{key:'money',title:'Money & payments',facts:[{text:'Use euro 12',sourceType:'ai_general'}]}]}]};
 const before=JSON.stringify(snapshot),canonical=printableEssentials(snapshot);assert(!JSON.stringify(canonical).includes('Fabricated visa advice'));
 for(const locale of supportedLocales)await requestContext.run({locale,pdfTranslations:{'Use euro 12':'Display fact 12'}},async()=>{
  const htmls=[itineraryHtml(trip,plan,[],[],[]),essentialsPdfHtml(trip,snapshot),await travelBookHtml(state,plan,[],{essentials:snapshot})];
  for(const [index,html]of htmls.entries()){assert(html.includes('lang="'+locale+'"'));assert(html.includes('data:font/ttf;base64,'));assert(html.includes('font-src data:'));assert(!html.includes('Fabricated visa advice'));assert(html.includes(new Intl.DateTimeFormat(locale==='en'?'en-GB':locale,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date('2026-10-08'))),locale+' PDF '+index);}
  assert(htmls[0].includes(serverCatalogs[locale]['pdf.travelers']));assert(htmls[1].includes(serverCatalogs[locale]['pdf.beforeGo']));assert(htmls[2].includes(serverCatalogs[locale]['pdf.fullBook']));assert(htmls[1].includes('Display fact 12'));
 });
 assert.equal(JSON.stringify(snapshot),before);assert.match(pdfFontCss,/font-weight:100 900/);assert((await readFile(new URL('../assets/fonts/NotoSans.ttf',import.meta.url))).length>100000);assert((await readFile(new URL('../assets/fonts/OFL.txt',import.meta.url),'utf8')).includes('SIL OPEN FONT LICENSE'));
});
test('PDF translation helper is cache-only on misses and keeps request language context',async t=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'tripnexa-i18n-')),previous=process.env.LOCALE_TRANSLATION_CACHE_DIR;process.env.LOCALE_TRANSLATION_CACHE_DIR=directory;
 t.after(async()=>{if(previous===undefined)delete process.env.LOCALE_TRANSLATION_CACHE_DIR;else process.env.LOCALE_TRANSLATION_CACHE_DIR=previous;await rm(directory,{recursive:true,force:true});});
 await requestContext.run({locale:'ru'},()=>withPdfTranslations({items:[{step_type:'transport',title:'Uncached'}]},'owner',()=>{assert.equal(serverLocale(),'ru');assert.deepEqual({...requestContext.getStore().pdfTranslations},{});}));
 await recordModelLocale(await response({items:[{step_type:'transport',title:'На машине'}]}).json(),'ru');
 const result=await translateSavedTexts(['На машине'],{locale:'ru',owner:'owner',directory,generate:true,call:()=>assert.fail('Already generated in the requested locale')});assert.equal(result['На машине'],'На машине');
 const lock=path.join(directory,translationKey([],'fr','owner')+'.lock');await writeFile(lock,'');
 const fallback=await translateSavedTexts(['Uncached'],{locale:'fr',owner:'owner',directory,generate:false});assert.deepEqual({...fallback},{});
});
