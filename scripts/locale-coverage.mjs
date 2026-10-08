import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {serverCatalogs,serverSourceKeys} from '../src/i18n/server-messages.js';

export const supportedLocales=['en','ro','ru','de','fr','es'];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// These are official names, technical units, or deliberately language-neutral UI symbols.
// This list must not be expanded merely to hide untranslated prose.
const invariant=/^(?:TripNexa|TripSync|Google(?: Maps)?|Google Maps Platform|Apple|OpenAI|Stripe|PayPal|GetYourGuide|Viator|Tiqets|Klook|Booking\.com|Airbnb|YouTube|Facebook|Instagram|WhatsApp|NASA|MET Norway|ADMIN|PRO|Pro|PDF|AI|OK|GPS|URL|UTC|EUR|USD|GBP|RON|MDL|RUB|CNY|CHF|JPY|CAD|AUD|NZD|SEK|NOK|DKK|PLN|CZK|HUF|TRY|ILS|AED|THB|°?C|°?F|km|kg|MB|GB|mm|hPa|km\/h|kmh|mph|m\/s|Email|E-mail|Taxi|Hotel|Safari|Chrome|Firefox|Edge|QR|N\/A|AM|PM|ID|IBAN|SWIFT|BIC|API)$/i;
const placeholders=text=>[...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(match=>match[1]).sort().join(',');
// Exact non-translatable findings reviewed from I18N_QA_ISSUES.json.
// Keep provider/feature names, example addresses and CSS identifiers intact.
const reviewedIdentifiers=new Set(['Google Maps ·','NASA POWER','Tel Aviv','Trip Health','Trip Packs','TripNexa Pro','you@example.com','group-[.toast]:text-muted-foreground']);
// Native words can legitimately match English. These are locale-specific,
// exact reviewed labels, never an exemption for sentences or arbitrary keys.
const reviewedNativeLabels={ro:new Set(['Transfer','Transport','document','Total','Local']),de:new Set(['Museum','Transfer','Bus']),fr:new Set(['Actions','Suggestion','Suggestions','Date','Documents','Train','Ferry','Transport','document','Total','Local']),es:new Set(['Total'])};
const prose=text=>typeof text==='string'&&/(?:[A-Za-z]{3}|To-Do)/.test(text)&&!invariant.test(text.trim())&&!reviewedIdentifiers.has(text)&&! /^(?:https?:|mailto:|data:|\/[\w/]|#[\w-])/.test(text.trim());
export function checkCatalogs(catalogs,required,shared=serverCatalogs){
 const errors=[];
 const english=catalogs.en||{};
 for(const key of Object.keys(english))if(Object.hasOwn(shared.en||{},key)&&english[key]!==shared.en[key])errors.push('Conflicting UI/server key: '+key);
 for(const locale of supportedLocales){
  const catalog=catalogs[locale]||{};
  for(const key of Object.keys(english)){
   if(typeof catalog[key]!=='string'||!catalog[key].trim())errors.push(`${locale}: missing/empty ${key}`);
   else if(placeholders(catalog[key])!==placeholders(english[key]))errors.push(`${locale}: interpolation ${key}`);
  }
  for(const key of Object.keys(shared.en||{})){
   if(typeof shared[locale]?.[key]!=='string'||!shared[locale][key].trim())errors.push(`${locale}: missing shared ${key}`);
   else if(placeholders(shared[locale][key])!==placeholders(shared.en[key]))errors.push(`${locale}: shared interpolation ${key}`);
  }
  for(const key of Object.keys(catalog))if(!Object.hasOwn(english,key))errors.push(`${locale}: unexpected ${key}`);
 }
 for(const key of required)if(!Object.hasOwn(english,key)&&!Object.hasOwn(shared.en||{},key)&&!Object.hasOwn(english,key+'.one'))errors.push('Unknown required key: '+key);
 return errors;
}
function literal(node){
 if(node?.type==='StringLiteral')return node.value;
 if(node?.type==='TemplateLiteral')return node.quasis.map((part,index)=>part.value.cooked+(index<node.expressions.length?'{{v'+index+'}}':'')).join('');
 return null;
}
export function inspectSource(source,file){
 const required=[],copy=[],contractViolations=[];
 const ast=parse(source,{sourceType:'module',plugins:['jsx','importAttributes']});
 const add=(node,kind)=>{const value=literal(node);if(prose(value))copy.push({file,line:node.loc.start.line,kind,text:value});};
 const keyArguments=node=>{
  if(node?.type==='StringLiteral')required.push(node.value);
  else if(node?.type==='ConditionalExpression'){keyArguments(node.consequent);keyArguments(node.alternate);}
  else if(node?.type==='LogicalExpression'){keyArguments(node.left);keyArguments(node.right);}
 };
 const includesTranslation=node=>{
  if(!node||typeof node!=='object')return false;
  if(node.type==='CallExpression'&&['t','translateText'].includes(node.callee?.name))return true;
  return Object.values(node).some(value=>Array.isArray(value)?value.some(includesTranslation):value&&typeof value==='object'&&includesTranslation(value));
 };
 function visit(node,parent){
  if(!node||typeof node!=='object')return;
  // The shared 404 screen contains a legacy note visible only to administrators.
  if(node.type==='LogicalExpression'&&node.operator==='&&'&&/role\s*===\s*['"]admin['"]/.test(source.slice(node.left.start,node.left.end)))return;
  if(node.type==='CallExpression'&&node.callee?.name==='t')keyArguments(node.arguments[0]);
  if(['MemberExpression','OptionalMemberExpression'].includes(node.type)&&node.computed&&includesTranslation(node.property))contractViolations.push({file,line:node.loc.start.line,reason:'Translated schema/property lookup'});
  if(node.type==='ObjectProperty'&&['category','step_type','sourceType','route_mode','key','id','feature','ticket_type','priority'].includes(node.key?.name)&&includesTranslation(node.value))contractViolations.push({file,line:node.loc.start.line,reason:'Translated internal identifier '+node.key.name});
  if(node.type==='JSXText'&&prose(node.value.trim().replace(/\s+/g,' ')))copy.push({file,line:node.loc.start.line,kind:'JSX text',text:node.value.trim().replace(/\s+/g,' ')});
  if(node.type==='JSXAttribute'&&['title','alt','aria-label','placeholder','label','description','eyebrow'].includes(node.name?.name))add(node.value,'UI attribute');
  if(node.type==='JSXExpressionContainer'&&parent?.type!=='JSXAttribute')add(node.expression,'rendered literal');
  if(node.type==='ObjectProperty'&&['label','title','description','placeholder','message','notice','reason','error','eyebrow','text'].includes(node.key?.name||node.key?.value))add(node.value,'display object copy; review bridge');
  if(node.type==='CallExpression'&&['setError','setNotice','alert','confirm'].includes(node.callee?.name||node.callee?.property?.name))add(node.arguments[0],'feedback copy; review bridge');
  if(node.type==='NewExpression'&&node.callee?.name==='Error')add(node.arguments[0],'error copy; review bridge');
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(child=>visit(child,node));else if(value&&typeof value==='object')visit(value,node);
 }visit(ast);
 return {required,copy,contractViolations};
}
export function coverageReport(projectRoot=root){
 const catalogs=Object.fromEntries(supportedLocales.map(locale=>[locale,JSON.parse(fs.readFileSync(path.join(projectRoot,'src/i18n/locales',locale+'.json'),'utf8'))]));
 const required=new Set(),locations=new Map(),hardcoded=[],contractViolations=[];
 const sourceKeys=new Map(Object.entries(catalogs.en).map(([key,text])=>[text,key]));
 function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(['admin','i18n'].includes(entry.name)||entry.name==='Admin.jsx')continue;
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())walk(file);
  else if(/\.(?:jsx?|mjs)$/.test(entry.name)){
   const relative=path.relative(projectRoot,file).replaceAll('\\','/');
   const found=inspectSource(fs.readFileSync(file,'utf8'),relative);
   for(const key of found.required){required.add(key);if(!locations.has(key))locations.set(key,[]);locations.get(key).push(relative);}
   for(const entry of found.copy){const key=sourceKeys.get(entry.text)||serverSourceKeys.get(entry.text);if(key){required.add(key);if(!locations.has(key))locations.set(key,[]);locations.get(key).push(relative);}}
   hardcoded.push(...found.copy);
   contractViolations.push(...found.contractViolations);
  }
 }}walk(path.join(projectRoot,'src'));
 const untranslated={};
 for(const locale of supportedLocales.slice(1))untranslated[locale]=Object.entries(catalogs.en).filter(([key,english])=>{
  const effective=serverCatalogs[locale][key]??serverCatalogs[locale][serverSourceKeys.get(english)]??catalogs[locale][key];
  return prose(english)&&effective===english&&!reviewedNativeLabels[locale]?.has(english);
 }).map(([key,english])=>({key,english,required:required.has(key),files:[...new Set(locations.get(key)||[])]}));
 const known=new Set([...Object.values(catalogs.en),...serverSourceKeys.keys()]);
 for(const entry of hardcoded)entry.catalogued=known.has(entry.text);
 return {locales:supportedLocales,requiredKeys:required.size,catalogKeys:Object.keys(catalogs.en).length,errors:[...checkCatalogs(catalogs,required),...contractViolations.map(entry=>`${entry.file}:${entry.line}: ${entry.reason}`)],untranslated,hardcoded,contractViolations,notes:['Hard-coded entries are review candidates, not automatic enum/schema rewrites.','English-identical catalog values are potential fallback defects; official names/units above are exempt.','Shared server translations are applied before checking UI English fallback, matching the runtime.','Admin/Super Admin, marketing, historical exports and Blog are outside this audit.']};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=coverageReport();
 fs.mkdirSync(path.join(root,'.local/i18n'),{recursive:true});
 const output=path.join(root,'.local/i18n/locale-coverage.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 const counts=Object.fromEntries(Object.entries(report.untranslated).map(([locale,entries])=>[locale,{all:entries.length,required:entries.filter(entry=>entry.required).length}]));
 console.log(JSON.stringify({requiredKeys:report.requiredKeys,missing:report.errors.length,englishFallbackCandidates:counts,hardcodedCandidates:report.hardcoded.length,report:'.local/i18n/locale-coverage.json'},null,2));
 if(report.errors.length)console.error(report.errors.join('\n'));
 if(report.errors.length||process.argv.includes('--release')&&(Object.values(report.untranslated).some(entries=>entries.some(entry=>entry.required))||report.hardcoded.some(entry=>['JSX text','rendered literal','UI attribute'].includes(entry.kind))))process.exitCode=1;
}
