// Developer-only, metered check. One provider request; no snapshot/DB/telemetry writes.
import {config} from '../server/config.js';
import {pool} from '../server/db.js';
import {essentialsContext} from '../server/premium-travel/essentials.js';
import {retrieveEssentials,GUIDE_TIMEOUT_MS} from '../server/premium-travel/essentials-provider.js';
const configured=!!(config.aiKey&&config.aiModel);
console.log(JSON.stringify({check:'synthetic-essentials',model:config.aiModel,configured,timeoutMs:GUIDE_TIMEOUT_MS}));
try{
 if(!process.argv.includes('--live')||!configured){
  console.log(JSON.stringify({livePerformed:false,reason:configured?'Pass --live to authorize one metered request.':'Local key/model unavailable; live behavior unverified.'}));
 }else{
  const state={ownerId:'synthetic-validation',trip:{id:'synthetic-bucharest',country:'Romania',destination_city:'Bucharest',start_date:'2026-10-01',end_date:'2026-10-03',timezone:'Europe/Bucharest',currency:'RON'},places:[],items:[],tripItems:[]};
  const began=Date.now(),guide=await retrieveEssentials(essentialsContext(state,'PA'));
  console.log(JSON.stringify({livePerformed:true,latencyMs:Date.now()-began,generationCalls:guide.generationCalls,guidanceStatus:guide.guidanceStatus,verification:guide.verification.status,
   countries:guide.countries.map(country=>({code:country.code,sections:country.sections.map(section=>({key:section.key,status:section.generation?.status||'fallback',factCount:section.facts.length}))}))}));
  if(guide.guidanceStatus==='failed')process.exitCode=1;
 }
}finally{await pool.end();}
