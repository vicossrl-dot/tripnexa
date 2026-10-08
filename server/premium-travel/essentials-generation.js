import {essentialsGuideVersion,requiredPracticalKeys,generatedRequiredKeys,practicalFields,practicalSectionReady} from '../../src/lib/essentials-guidance.js';

export const generationInstructions={
 money:'MONEY & PAYMENTS: currency gives local currency/code/symbol; payments describes cash/card reality, foreign cards, tipping expectations and city-specific payment quirks; atms gives practical visitor ATM context. An optional recommendation is tailored to this trip. No invented live rates, fees or exact daily budgets.',
 power:'POWER & PLUGS: specifications gives exact plug types, voltage and frequency for the actual destination/city, including regional differences. compatibility explains 100–240V chargers versus 220–240V-only appliances, adapter versus converter. Compare origin plug standards ONLY when originCountry is reliably supplied; passport nationality is not origin. No standalone check-your-charger filler.',
 connectivity:'CONNECTIVITY: options gives tourist eSIM, physical SIM, pocket-WiFi and actual Wi-Fi context; activation explains purchase/setup, unlocked/eSIM compatibility and data-only versus local number; recommendation chooses a realistic setup for the supplied duration. Provider examples only when reliable. Registration/legal claims require official evidence.',
 transport:'GETTING AROUND: systems names modes/operators actually present in the destination cities; payment gives usable transit cards/passes and payment methods; recommendations uses public attraction/day context and relevant arrival transport. Include airport-city advice only when the arrival context supports it. Optional reasonably supported fares must say Approximate fare. Do not invent routes, days or prices.',
 customs:'LOCAL CUSTOMS & ETIQUETTE: give 5–8 concrete social facts a visitor needs: greetings/bow/handshake, gestures, train calls/volume, marked queues, shoes, chopsticks/dining, restaurant/taxi/hotel/guide tipping, photography or religious-site behavior. Destination-specific, never respect-local-customs filler. Social norms are not legal requirements.',
 phrases:'USEFUL PHRASES: give 5–7 useful destination-language phrases, each with localScript, romanization when applicable, meaning in English: greeting, thanks, excuse me, please, directions, English or help. No duplicates, emergency numbers or long language lesson.',
 critical:'IMPORTANT TO KNOW: optional 0–3 nonduplicated useful facts such as luggage forwarding, trash bins, ordering/toilet conventions, local apps or date-specific holiday impact. Tax-free/legal rules are official-only, never from memory. Empty when nothing valuable applies.',
 entryDocuments:'ENTRY & DOCUMENTS: answer selected passport → destination on trip dates: visa YES/NO/authorization, tourist stay maximum/conditions, passport validity, arrival/customs/immigration registration, eVisa/ETA and dated changes. ONLY current destination immigration/foreign-ministry/embassy/government entry evidence. No passport means no entry search/claims. If not verified return no facts; the server supplies the official-confirmation message/link.',
 emergency:'EMERGENCY: only current official evidence for police, ambulance/fire and official tourist-help numbers. If unavailable return no facts. Never guess from memory.',
 legal:'LEGAL: optional actual visitor-relevant legal obligations only with official evidence. Keep ordinary etiquette in customs. Do not add generic laws or unverified restrictions.',
 notice:'CURRENT OFFICIAL NOTICE: optional serious concrete entry restriction, health requirement, warning or major transport disruption relevant to destination AND trip dates. Evidence names destination/event and exact start/end dates, or dated until-further-notice language. No generic Health/Safety/Water cards.'
};
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const text={type:'string',minLength:1,maxLength:300},fact=object({text}),optionalFact={anyOf:[fact,{type:'null'}]};
const officialFact=object({text,sourceUrl:{type:'string'},evidence:{type:'string',minLength:20,maxLength:300},appliesFrom:{type:['string','null']},appliesThrough:{type:['string','null']}});
export const briefSectionKeys=[...generatedRequiredKeys,'phrases','critical','entryDocuments','emergency','legal','notice'];
export function travelBriefFormat(codes){
 const sections=Object.fromEntries(briefSectionKeys.map(key=>[key,
  {anyOf:[
  practicalFields[key]?object(Object.fromEntries([...practicalFields[key],...(key==='money'?['recommendation']:key==='transport'?['fares']:[])].map(field=>[field,optionalFact]))):
  key==='phrases'?object({phrases:{type:'array',maxItems:7,items:object({localScript:text,romanization:{type:['string','null']},meaning:text})}}):
  object({facts:{type:'array',maxItems:key==='customs'?8:key==='entryDocuments'?7:3,items:['entryDocuments','emergency','legal','notice'].includes(key)?officialFact:fact}}),
  {type:'null'}]}
 ]));
 return {type:'json_schema',name:'tripnexa_universal_travel_brief',strict:true,schema:object({countries:object(Object.fromEntries(codes.map(code=>[code,object(sections)])))})};
}
export const generatedSectionReady=practicalSectionReady;
// Coverage is descriptive; it never schedules repairs or creates repetitive error cards.
export function evaluateCompleteness(data,{current=data.version===essentialsGuideVersion}={}){
 let useful=0;
 for(const country of data.countries){
  for(const section of country.sections){
   if(!requiredPracticalKeys.includes(section.key))continue;
   const ready=section.key==='timezone'?section.facts.some(fact=>fact.sourceType==='calculated'):practicalSectionReady(section);
   section.generation=ready?{status:'ready',reason:null}:{...section.generation,status:section.generation?.status==='failed'?'failed':section.generation?.status==='rejected'?'rejected':'missing'};
   if(generatedRequiredKeys.includes(section.key)&&section.facts.some(fact=>['ai_general','trusted','official'].includes(fact.sourceType)))useful++;
  }
  country.generation={status:requiredPracticalKeys.every(key=>country.sections.find(section=>section.key===key)?.generation?.status==='ready')?'complete':country.sections.some(section=>generatedRequiredKeys.includes(section.key)&&section.facts.some(fact=>['ai_general','trusted','official'].includes(fact.sourceType)))?'partial':'failed'};
 }
 data.generation={...data.generation,status:data.countries.length&&data.countries.every(country=>country.generation.status==='complete')?'complete':useful?'partial':'failed',current,requiredSections:requiredPracticalKeys};
 return data;
}
