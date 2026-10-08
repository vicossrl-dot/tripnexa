import {classifySource} from './essentials-sources.js';
import {practicalGuidance,guidanceForSection,genericEssentialsText} from '../../src/lib/essentials-guidance.js';

export const aiSectionKeys=['money','power','connectivity','transport','customs','rules','critical','phrases'];
const highRiskKeys=new Set(['entryDocuments','emergency','safety','notice']);
// A second, server-side boundary catches risk-bearing claims misplaced into practical sections.
const riskWords=/\b(?:visa|passport|immigration|entry requirement|arrival form|customs registration|customs declaration|tax[- ]free|duty[- ]free|border|residen\w*|citizen\w*|nationality|vaccin\w*|medical|medicine|medication|health|disease|infection|outbreak|epidemic|evacuat\w*|travel alert|severe storm|typhoon|tsunami|allerg\w*|pregnan\w*|emergency|police|ambulance|safety alert|travel warning|travel advisory|safe(?:ty)?|unsafe|danger\w*|law|laws|legal|illegal|prohibit\w*|ban(?:ned)?|fine[ds]?|penalt\w*|arrest\w*|prison|crime|terror\w*|drinking water|tap water|potable|drinkable|boil\w* water)\b/i;
export function isHighRisk(key,text=''){return highRiskKeys.has(key)||riskWords.test(String(text))||/\b(?:call|dial|telephone|tel)\b.{0,30}\d{2,}|\b(?:1[12]\d|911|999|000)\b|\b(?:drink\w*|consum\w*)\b.{0,45}\b(?:water|faucet)|\b(?:water|faucet)\b.{0,45}\b(?:drink\w*|consum\w*|clean|contamin\w*)|\b(?:must|required|mandatory|compulsory)\b.{0,50}\b(?:identity|registration|approval|insurance|test|licen[cs]e)|\b(?:stay|entry|visit)\w*\b.{0,35}\b(?:days?|months?)\b|\b(?:validity|valid for|inoculat\w*|immuni\w*|PCR|antigen|cannabis|narcotic\w*|quarantine|smoking|vaping|drone\w*|firearm\w*|weapon\w*|driv\w*|seatbelt\w*|speed limit|forbidden|unlawful)\b|\b(?:allowed|permitted|mandatory|compulsory)\b|\b(?:drinking|alcohol)\b.{0,30}\b(?:age|years|under|over|from)\b/i.test(String(text));}
export function aiRejectionReason(key,text){
 if(!aiSectionKeys.includes(key))return 'official_only';
 if(typeof text!=='string'||!text.trim()||text.length>300)return 'invalid_text';
 if(isHighRisk(key,text))return 'official_evidence_required';
 if(genericEssentialsText(text))return 'generic_content';
 return /https?:\/\/|www\./.test(text)?'unsupported_url':null;
}
export const permitsAi=(key,text)=>aiRejectionReason(key,text)===null;
export function validFact(fact,key,code,{legacyCheckedAt=null}={}){
 if(!fact||typeof fact.text!=='string'||!fact.text.trim()||fact.text.length>300)return null;
 if(fact.sourceType==='practical')return [...(practicalGuidance[key]||[]),...guidanceForSection(key,false)].includes(fact.text)?{text:fact.text,sourceType:'practical',sourceUrl:null,verifiedAt:null,checkedAt:null}:null;
 if(fact.sourceType==='saved_trip')return ['money','timezone'].includes(key)&&/^Saved trip (currency|timezone): /.test(fact.text)?{text:fact.text,sourceType:'saved_trip',sourceUrl:null,verifiedAt:null,checkedAt:null}:null;
 if(fact.sourceType==='calculated')return key==='timezone'&&fact.computedBy==='intl-date-offsets'?{...fact,sourceUrl:null,verifiedAt:null,checkedAt:null}:null;
 if(fact.sourceType==='ai_general')return permitsAi(key,fact.text)?{text:fact.text.trim(),...(typeof fact.field==='string'&&/^[a-z]{1,30}$/.test(fact.field)?{field:fact.field}:{}),...(key==='phrases'&&typeof fact.localScript==='string'&&typeof fact.meaning==='string'?{localScript:fact.localScript.slice(0,300),romanization:typeof fact.romanization==='string'?fact.romanization.slice(0,300):null,meaning:fact.meaning.slice(0,300)}:{}),sourceType:'ai_general',sourceUrl:null,verifiedAt:null,checkedAt:null}:null;
 const source=classifySource(fact.sourceUrl,code,key,isHighRisk(key,fact.text));if(!source)return null;
 if(fact.sourceType&&fact.sourceType!==source.sourceType)return null;
 const checkedAt=fact.verifiedAt||fact.checkedAt||legacyCheckedAt||null;
 const verified=source.sourceType==='official'&&fact.evidenceType==='page'&&checkedAt&&Number.isFinite(Date.parse(checkedAt))&&Date.now()-Date.parse(checkedAt)<86400000&&Date.parse(checkedAt)<=Date.now()+60000;
 if(isHighRisk(key,fact.text)&&!verified)return null;
 if(key==='notice'&&!fact.importantNotice)return null;
 if(!isHighRisk(key,fact.text)&&genericEssentialsText(fact.text))return null;
 return {...fact,sourceType:source.sourceType,sourceUrl:source.url,verifiedAt:verified?checkedAt:null,checkedAt:checkedAt||null};
}
export function essentialsDiagnostic(code,event,log=console.info){
 if(!/^[A-Z]{2}$/.test(String(code)))return;
 // Only internal event names/country codes. Never interpolate provider errors, bodies or URLs.
 const allowed=new Set(['retrieval-unconfigured','guide-generated','guide-failed','verification-failed','verification-complete','official-page-unreadable','snapshot-save-failed','refresh-partial-failure']);
 if(allowed.has(event))log(`[essentials] ${code} ${event}`);
}
