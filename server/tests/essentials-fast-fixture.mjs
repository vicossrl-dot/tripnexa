import {essentialsContext} from '../premium-travel/essentials.js';
import {retrieveEssentials} from '../premium-travel/essentials-provider.js';
export const essentialsState={ownerId:'owner',trip:{id:'universal-essentials-fixture',country:'Japan',destination_city:'Kyoto',currency:'JPY',timezone:'Asia/Tokyo',start_date:'2026-10-06',end_date:'2026-10-09',name:'PRIVATE_NAME',email:'PRIVATE_EMAIL',arrival_ticket_url:'PRIVATE_TICKET'},tripItems:[],places:[],items:[]};
// Offline guide/source fixtures are not live destination advice.
const fact=text=>({text});
export const guideValues={
 money:{currency:fact('Japan uses the Japanese yen (JPY, ¥).'),payments:fact('Cards are common in Japanese hotels and large stores; small restaurants, temples and some ticket machines still use cash. Tipping is normally not expected.'),atms:fact('Convenience-store ATMs such as Seven Bank commonly support foreign cards.'),recommendation:fact('For four days in Kyoto, combine a card with yen for smaller restaurants and temple purchases.')},
 power:{specifications:fact('Japan uses Type A/B plugs and 100V electricity; Kyoto uses 60Hz, while eastern Japan uses 50Hz.'),compatibility:fact('Type C/F plugs need a Type A adapter. Chargers marked 100–240V need an adapter; 220–240V-only devices may need a converter.')},
 connectivity:{options:fact('Japan tourist data SIMs/eSIMs and rentable pocket Wi-Fi provide visitor connectivity; hotels and major stations often provide Wi-Fi.'),activation:fact('Tourist data SIMs are sold at Japanese airports and online; most short-term visitors need data rather than a local number.'),recommendation:fact('For a four-day Kyoto trip, a tourist eSIM installed before departure is convenient on an unlocked eSIM-compatible phone.')},
 transport:{systems:fact('Kyoto has a subway, city buses and JR/private railways. ICOCA and other major IC cards work on most urban services.'),payment:fact('ICOCA and other major IC cards are useful for Japanese urban transit; some bus passes are separate.'),recommendations:fact('JR/private railways are useful for Arashiyama and Fushimi Inari; buses reach temple areas beyond the rail corridors.'),fares:fact('Approximate fare: ¥230 for a standard Kyoto central-zone adult bus trip; check the operator before travel.')},
 customs:{facts:[
  'Tipping is generally not expected in Japanese restaurants or taxis; hotel staff usually do not expect tips and guides may state their own practice.',
  'In Japan, a small bow is a common greeting; follow your host when a handshake is offered.',
  'On Japanese trains, keep phone conversations off the carriage and speak quietly.',
  'At Japanese railway platforms, queue along the marked boarding lines.',
  'Remove shoes at the entrance to Japanese homes and temple rooms where indoor footwear is provided.',
  'Never stand chopsticks upright in rice; this resembles Japanese funeral offerings.',
  'Avoid pointing at people or passing food directly between pairs of chopsticks.',
  'Ask before photographing people in Kyoto and follow the site staff at religious spaces.'
 ].map(fact)},
 critical:{facts:[fact('Public trash bins are scarce in many Kyoto streets; keep a small bag for rubbish until you find a bin.'),fact('Japanese luggage-forwarding services can simplify hotel-to-hotel travel; arrange timing with your accommodation.')]},
 phrases:{phrases:[
  {localScript:'こんにちは',romanization:'Konnichiwa',meaning:'Hello'},
  {localScript:'ありがとうございます',romanization:'Arigatō gozaimasu',meaning:'Thank you'},
  {localScript:'すみません',romanization:'Sumimasen',meaning:'Excuse me'},
  {localScript:'お願いします',romanization:'Onegaishimasu',meaning:'Please'},
  {localScript:'英語を話せますか',romanization:'Eigo o hanasemasu ka',meaning:'Do you speak English?'},
  {localScript:'駅はどこですか',romanization:'Eki wa doko desu ka',meaning:'Where is the station?'}
 ]},
 entryDocuments:{facts:[]},emergency:{facts:[]},legal:{facts:[]},notice:{facts:[]}
};
export const practicalResponse=(countries,sources=[])=>({status:'completed',output:[...(sources.length?[{type:'web_search_call',status:'completed',action:{sources:sources.map(url=>({url}))}}]:[]),{type:'message',content:[{type:'output_text',text:JSON.stringify({countries})}]}]});
export const response=practicalResponse;
export const guideCall=async(_path,body)=>practicalResponse(Object.fromEntries(JSON.parse(body.input).countries.map(code=>[code,structuredClone(guideValues)])));
export const guideFor=(state=essentialsState,passport='MD')=>retrieveEssentials(essentialsContext(state,passport),{call:guideCall,configured:true,log:()=>{}});
export const officialUrls={entry:'https://www.mofa.go.jp/j_info/visit/visa/index.html',emergency:'https://www.fdma.go.jp/en/',notice:'https://www.mhlw.go.jp/english/'};
export const officialFixture=(passport='MD')=>{
 const nationality=passport==='RO'?'Romanian':'Moldovan',evidence=`Fixture-only Japan entry policy: ${nationality} passport holders require a tourist visa before departure.`;
 const emergency='Fixture-only Japan emergency reference: Police 110; Ambulance and Fire 119.';
 const notice='Japan: a severe storm warning affects Kyoto transport from 6 October 2026 to 9 October 2026.';
 const guide=structuredClone(guideValues),candidate=(evidence,sourceUrl,appliesFrom=null,appliesThrough=null)=>({text:'Unsupported model paraphrase',sourceUrl,evidence,appliesFrom,appliesThrough});
 guide.entryDocuments.facts=[candidate(evidence,officialUrls.entry)];guide.emergency.facts=[candidate(emergency,officialUrls.emergency)];guide.notice.facts=[candidate(notice,officialUrls.notice,'2026-10-06','2026-10-09')];
 return {guide,pages:new Map([[officialUrls.entry,evidence],[officialUrls.emergency,emergency],[officialUrls.notice,notice]]),evidence,emergency,notice};
};
export function memorySnapshots(){const rows=new Map(),sql=[];return {rows,sql,execute:async(query,params)=>{
 sql.push({query,params});
 if(query.startsWith('SELECT')){const key=params.slice(2,7).find(key=>rows.has(key));return [key?[structuredClone({...rows.get(key),context_hash:key})]:[]];}
 if(query.startsWith('INSERT')){if(rows.has(params[2]))return [{affectedRows:0}];rows.set(params[2],{snapshot:JSON.parse(params[4]),checked_at:params[5],context_hash:params[2]});return [{affectedRows:1}];}
 if(query.startsWith('UPDATE')){const save=query.includes('checked_at=?'),row=rows.get(params[save?4:3]),expected=params[save?5:4];if(row&&(row.snapshot.generationId||null)===expected){row.snapshot=JSON.parse(params[0]);if(save)row.checked_at=params[1];return [{affectedRows:1}];}return [{affectedRows:0}];}
 return [{affectedRows:0}];
 }};}
