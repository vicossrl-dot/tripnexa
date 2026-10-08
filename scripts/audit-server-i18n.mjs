import fs from 'node:fs';
import path from 'node:path';
import {parse} from '@babel/parser';
import {serverSourceKeys} from '../src/i18n/server-messages.js';
import {serverMessage} from '../server/i18n.js';
// Read-only source audit. Internal enums, Admin tooling and canonical evidence prompts are excluded.
const values=new Set();
function copy(node){
 if(!node)return;
 if(node.type==='StringLiteral'&&/[A-Za-z]{3}/.test(node.value))values.add(node.value);
 else if(node.type==='TemplateLiteral'){let source='';for(let index=0;index<node.quasis.length;index++){source+=node.quasis[index].value.cooked;if(index<node.expressions.length)source+='{{v'+index+'}}';}if(/[A-Za-z]{3}/.test(source))values.add(source);}
 else if(node.type==='ConditionalExpression'){copy(node.consequent);copy(node.alternate);}
 else if(node.type==='LogicalExpression'){copy(node.left);copy(node.right);}
}
function inspect(file){
 const ast=parse(fs.readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx','importAttributes']});
 function visit(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee?.name==='assert')copy(node.arguments[2]);
  if(node.type==='NewExpression'&&node.callee?.name==='HttpError')copy(node.arguments[1]);
  if(node.type==='NewExpression'&&node.callee?.name==='BillingError')copy(node.arguments[2]);
  if(node.type==='ObjectProperty'&&['error','message','notice','reason'].includes(node.key?.name||node.key?.value))copy(node.value);
  if(node.type==='CallExpression'&&['pdfLabel','serverMessage'].includes(node.callee?.name))copy(node.arguments[0]);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 }visit(ast);
}
const runtime=['app','auth','account','security','schema','entities','trips','uploads','places','place-autocomplete','place-details','ai','planning-suggestions','itinerary-service','itinerary-engine','itinerary-ai','itinerary-pdf','meal-options','meal-context','wallet','wallet-extraction','stay-extraction','hotel-url','provider-errors','file-lifecycle'];
for(const module of runtime){const file='server/'+module+'.js';if(fs.existsSync(file))inspect(file);}
for(const file of ['server/premium-travel/router.js','server/premium-travel/calendar.js','server/premium-travel/essentials-pdf.js','server/premium-travel/travel-book.js','server/premium-travel/pdf-day-map.js','server/auth-emails.js'])inspect(file);
for(const directory of ['server/social-auth','server/billing','server/weather'])for(const entry of fs.readdirSync(directory))if(entry.endsWith('.js')&&!/admin|migrat|config|diagnostic/.test(entry))inspect(path.join(directory,entry));
const english=JSON.parse(fs.readFileSync('src/i18n/locales/en.json','utf8'));
for(const file of ['src/pages/PublicTrip.jsx','src/components/itinerary/TicketOptions.jsx','src/components/AffiliateDisclosure.jsx'])for(const match of fs.readFileSync(file,'utf8').matchAll(/\bt\("([^"]+)"/g))if(english[match[1]])values.add(english[match[1]]);
const ignored=new Set(['reserved','succeeded','failed','available_time','daily_limit','provider_or_schema_failure','undefined','timeout','active','none','unknown']);
const missing=[...values].filter(value=>!ignored.has(value)&&!/^https?:|^<|^[a-z_]+$/.test(value)&&!serverSourceKeys.has(value)&&['ro','ru','de','fr','es'].some(locale=>serverMessage(value,locale)===value));
if(missing.length){console.error('Uncatalogued user-facing server copy:\n'+missing.join('\n'));process.exitCode=1;}
else console.log(`Server i18n audit: ${values.size} static messages/templates, six locales, no missing keys.`);
