import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {inflateSync} from 'node:zlib';
import {requestContext} from '../request-context.js';
import {itineraryHtml,renderPdf} from '../itinerary-pdf.js';
import {essentialsPdfHtml} from '../premium-travel/essentials-pdf.js';
import {travelBookHtml} from '../premium-travel/travel-book.js';
import {pool} from '../db.js';
import {config} from '../config.js';
import {translateSavedTexts,generatedTexts} from '../localized-content.js';
// Explicit local Chromium fixture, never part of a production request or live AI test.
const trip={id:'fixture',name:'Москва — TripNexa',destination:'Москва',start_date:'2026-10-08',end_date:'2026-10-08',adults:2};
const items=[{id:'visit',step_type:'visit',title:'Musée du Louvre',date:'2026-10-08',start_time:'09:00',end_time:'10:00',duration_min:60,lat:48.8606,lng:2.3376},{id:'transfer',step_type:'transport',title:'Transfer',date:'2026-10-08',start_time:'10:00',end_time:'10:20',route_mode:'walk',route_origin:'Musée du Louvre',route_destination:'Café de Flore',route_duration_min:20,duration_min:20},{id:'meal',step_type:'meal',title:'Lunch',date:'2026-10-08',start_time:'12:00',end_time:'13:00',duration_min:60}];
const state={trip,items,tripItems:[],places:[]},plan={dates:['2026-10-08'],items};
const source='The euro is the currency of France.';
const translations={en:source,ro:'Euro este moneda Franței.',ru:'Евро — валюта Франции.',de:'Der Euro ist die Währung Frankreichs.',fr:'L’euro est la monnaie de la France.',es:'El euro es la moneda de Francia.'};
const snapshot={countries:[{code:'FR',country:'France',sections:[{key:'money',title:'Money & payments',facts:[{text:source,sourceType:'ai_general'}]}]}]};
const canonical=JSON.stringify({state,snapshot}),directory='.local/i18n/pdf-fixtures/cache',previous=[config.aiKey,config.aiModel];config.aiKey='fixture';config.aiModel='fixture';let calls=0;
await mkdir('.local/i18n/pdf-fixtures',{recursive:true});
try{
 for(const locale of ['en','ro','ru','de','fr','es'])await requestContext.run({locale},async()=>{
  const texts=generatedTexts({state,snapshot}),prepared=await translateSavedTexts(texts,{locale,owner:'pdf-fixture',directory,generate:true,call:async(_path,body)=>{calls++;return {output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({texts:JSON.parse(body.input).texts.map(text=>text===source?translations[locale]:text)})}]}]};}});
  requestContext.getStore().pdfTranslations=await translateSavedTexts(texts,{locale,owner:'pdf-fixture',directory,generate:false,call:()=>assert.fail('PDF reader must not generate translations')});assert.deepEqual(requestContext.getStore().pdfTranslations,prepared);
  const callsBeforeRendering=calls;
  const htmls=[['quick',itineraryHtml(trip,plan,[],[],[])],['essentials',essentialsPdfHtml(trip,snapshot)],['book',await travelBookHtml(state,plan,[],{essentials:snapshot})]];
  for(const [kind,html]of htmls){
   const pdf=await renderPdf(html,{allowEmbeddedImages:kind==='book'});assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert(pdf.length>10000);
   assert.match(pdf.toString('latin1'),/NotoSans/,'The PDF must embed Noto Sans, including inside CageFS with no system fonts.');
   const binary=pdf.toString('latin1'),decoded=[];for(const match of binary.matchAll(/stream\r?\n/g)){const start=match.index+match[0].length,end=binary.indexOf('endstream',start);if(end<0)continue;try{decoded.push(inflateSync(pdf.subarray(start,end)).toString('latin1'));}catch{}}
   assert(decoded.some(stream=>stream.includes('beginbfchar')||stream.includes('beginbfrange')),'Embedded font requires searchable Unicode mapping');
   if(locale==='ru')assert(decoded.some(stream=>/<04[0-9A-Fa-f]{2}>/.test(stream)),'Russian Cyrillic must be represented by the embedded font Unicode map');
   await writeFile(`.local/i18n/pdf-fixtures/${locale}-${kind}.pdf`,pdf);console.log(`${locale} ${kind}: embedded Noto Sans + searchable Cyrillic/Unicode, ${pdf.length} bytes`);
  }
  assert.equal(calls,callsBeforeRendering,'Rendering/downloading a PDF cannot trigger translation calls');
  assert.equal(JSON.stringify({state,snapshot}),canonical,'Localized PDFs must never overwrite canonical source');
 });
}finally{[config.aiKey,config.aiModel]=previous;await pool.end();}
