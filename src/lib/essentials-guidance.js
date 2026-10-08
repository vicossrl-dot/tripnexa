export const essentialsAbout='TripNexa uses AI to prepare practical travel guidance. Information marked Verified has been checked against a current official source. Entry, legal, emergency and other critical requirements can change, so confirm them with the linked official authority before travel.';
export const essentialsPdfAbout=essentialsAbout;
export const essentialsSections=[['entryDocuments','Entry & documents'],['money','Money & payments'],['power','Power & plugs'],['connectivity','Connectivity / SIM / eSIM'],['timezone','Time & time difference'],['transport','Getting around'],['emergency','Emergency numbers'],['customs','Local customs & etiquette'],['phrases','Useful phrases'],['critical','Important to know'],['notice','Important travel notice']];
export const sectionLimit=key=>({entryDocuments:7,money:4,power:4,timezone:12,transport:5,emergency:3,customs:8,rules:8,phrases:7,notice:2}[key]||3);
export const essentialsGuideVersion=5;
export const requiredPracticalKeys=['money','power','connectivity','timezone','transport','customs'];
export const generatedRequiredKeys=requiredPracticalKeys.filter(key=>key!=='timezone');
// Named fields are the completeness contract, not merely a minimum paragraph count.
export const practicalFields={money:['currency','payments','atms'],power:['specifications','compatibility'],connectivity:['options','activation','recommendation'],transport:['systems','payment','recommendations']};
export const incompleteEssentialsMessage='Your saved brief contains the available travel information.';
export function practicalSectionReady(section){
 const facts=(section?.facts||[]).filter(fact=>['ai_general','trusted'].includes(fact.sourceType)||fact.sourceType==='official'&&fact.verifiedAt);
 const fieldsReady=(practicalFields[section?.key]||[]).length>0&&practicalFields[section.key].every(field=>facts.some(fact=>fact.field===field));
 if(section?.key==='power'){
  const specifications=facts.find(fact=>fact.field==='specifications')?.text||'';
  return fieldsReady&&/\btypes?\s+[A-O]\b/i.test(specifications)&&/\b\d{2,3}\s*(?:V(?:AC)?|volts?)\b/i.test(specifications)&&/\b\d{2,3}\s*(?:Hz|hertz)\b/i.test(specifications);
 }
 return section?.key==='customs'?facts.length>=5:fieldsReady;
}
export function essentialsUpdateMessage(result){
 if(result.updateFailed)return result.generatedAt?'Your saved guide is still available. The update could not be completed.':'Travel essentials could not be prepared. Please try Update information again later.';
 if(result.generation?.status!=='complete'||!result.generation?.current)return incompleteEssentialsMessage+(result.retryBlocked?' Please wait briefly before trying Update information again.':'');
 return result.updateSkipped?'Saved information is already up to date.':'Travel essentials updated.';
}
export const practicalGuidance={
 entryDocuments:["We couldn't verify the current entry requirements automatically. Please confirm with the official immigration authority."],
 emergency:['Current emergency numbers could not be verified. Use the linked official emergency authority.']
};
export function guidanceForSection(key,passport=true){return key==='entryDocuments'&&!passport?['Choose your passport country to check applicable entry requirements.']:practicalGuidance[key]||[];}
// Empty ordinary sections are omitted; only critical verification has an unavailable state.
export const visibleEssentialsSections=country=>(country.sections||[]).filter(section=>!['safety','water','notice'].includes(section.key)&&essentialsSections.some(([key])=>key===section.key)&&(section.facts?.length||['entryDocuments','emergency'].includes(section.key)));
export const verifiedTravelNotices=country=>(country.sections||[]).find(section=>section.key==='notice')?.facts?.filter(fact=>fact.sourceType==='official'&&fact.verifiedAt&&fact.importantNotice&&Date.now()-Date.parse(fact.verifiedAt)<86400000)||[];
export function genericEssentialsText(text){return /respect local customs|check (?:your charger(?:'s|’s)?(?: label)?(?: for)?(?: the destination)? voltage|(?:local )?transport options|ticket options|local customs|with your carrier)|tipping varies|wi-?fi may be available|notify your bank|^public transport is available|pack suitable supplies|^carry essentials\b|carry a refillable bottle|consult (?:a|your) doctor|keep (?:your )?belongings safe|compare (?:eSIM and )?roaming (?:plans|options)|^check (?:your bank|card fees)|^keep a second (?:way|payment)|^save (?:an offline copy|the local transport operator)|^set a second clock|^confirm destination local time|^keep voices low in shared spaces|^allow a little extra time|^observe local signs|^ask whether service is included|^check whether the operator supports|^check your charger label|^download offline maps and keep your accommodation|^carry a small amount of local cash/i.test(String(text));}
