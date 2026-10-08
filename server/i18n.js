import {requestContext} from './request-context.js';
import {serverCatalogs,serverSourceKeys} from '../src/i18n/server-messages.js';
import en from '../src/i18n/locales/en.json' with {type:'json'};
import ro from '../src/i18n/locales/ro.json' with {type:'json'};
import ru from '../src/i18n/locales/ru.json' with {type:'json'};
import de from '../src/i18n/locales/de.json' with {type:'json'};
import fr from '../src/i18n/locales/fr.json' with {type:'json'};
import es from '../src/i18n/locales/es.json' with {type:'json'};
export const supportedLocales=['en','ro','ru','de','fr','es'];
export const validLocale=value=>typeof value==='string'&&supportedLocales.includes(value.toLowerCase().split(/[-_]/)[0])?value.toLowerCase().split(/[-_]/)[0]:null;
export const serverLocale=()=>validLocale(requestContext.getStore()?.locale)||'en';
export const adminLocaleRequest=()=>requestContext.getStore()?.adminLocaleRequest===true;
export const localeInstruction=locale=>`Human-readable prose must use ${ {en:'English',ro:'Romanian',ru:'Russian',de:'German',fr:'French',es:'Spanish'}[validLocale(locale)||'en'] }. JSON property names, enum values, IDs, codes, dates, times, validation contracts and internal values MUST remain exactly as specified in English. Preserve official names, proper nouns, quoted evidence, source URLs and provider names. Never translate enum values or add JSON properties.`;
const catalogs={en,ro,ru,de,fr,es};
export function serverCount(noun,count,locale=serverLocale()){
 locale=validLocale(locale)||'en';
 const category=new Intl.PluralRules(locale).select(Number(count)),base='counts.'+noun;
 const text=catalogs[locale][base+'.'+category]??catalogs[locale][base+'.other']??en[base+'.'+(Number(count)===1?'one':'other')];
 if(!text)return new Intl.NumberFormat(locale).format(Number(count))+' '+serverMessage(noun,locale);
 return text.replace(/\{\{count\}\}/g,new Intl.NumberFormat(locale).format(Number(count)));
}
const keys=new Map(Object.entries(en).map(([key,value])=>[value,key]));
const templates=[...Object.entries(serverCatalogs.en).map(([key,text])=>({key,text,server:true})),...Object.entries(en).map(([key,text])=>({key,text,server:false}))].filter(({text})=>text.includes('{{')).sort((a,b)=>b.text.replace(/\{\{\w+\}\}/g,'').length-a.text.replace(/\{\{\w+\}\}/g,'').length).map(item=>{
 const names=[];const source=item.text.split(/(\{\{\w+\}\})/).map(part=>{const match=part.match(/^\{\{(\w+)\}\}$/);if(match){names.push(match[1]);return '(.+?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');return {...item,names,pattern:new RegExp('^'+source+'$','s')};
});
export function serverMessage(source,locale=serverLocale()){
 if(typeof source!=='string')return source;
 locale=validLocale(locale)||'en';
 const serverKey=serverSourceKeys.get(source);if(serverKey)return serverCatalogs[locale][serverKey];
 const catalog=catalogs[locale],key=keys.get(source);
 if(key&&catalog[key]!==source)return catalog[key]||source;
 for(const template of templates){const match=source.match(template.pattern);if(match)return (template.server?serverCatalogs[locale][template.key]:catalog[template.key]||template.text).replace(/\{\{(\w+)\}\}/g,(_,name)=>{const value=match[template.names.indexOf(name)+1],fieldKey=template.key.startsWith('validation.')||name==='feature'?serverSourceKeys.get(value):null;return fieldKey?serverCatalogs[locale][fieldKey]:value;});}
 return key?catalog[key]||source:source;
}
export const serverDate=(value,options={})=>new Intl.DateTimeFormat(serverLocale()==='en'?'en-GB':serverLocale(),{timeZone:'UTC',...options}).format(new Date(typeof value==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)?value.replace(' ','T')+'Z':value));
export function requestLocale(req,res,next){
 const context=requestContext.getStore();
 if(context)context.adminLocaleRequest=/^\/api\/admin(?:\/|$)/i.test(req.originalUrl);
 if(context)context.locale=/^\/api\/admin(?:\/|$)/i.test(req.originalUrl)?'en':validLocale(req.get('X-TripNexa-Locale'))||validLocale(req.query.locale)||validLocale(req.user?.ui_locale)||(req.get('Accept-Language')||'').split(',').map(entry=>validLocale(entry.trim().split(';')[0])).find(Boolean)||'en';
 next();
}
export function localizedErrors(req,res,next){
 const json=res.json.bind(res);
 const send=res.send?.bind(res);
 if(send)res.send=body=>send(!/^\/api\/admin(?:\/|$)/i.test(req.originalUrl)&&res.statusCode>=400&&typeof body==='string'?serverMessage(body):body);
 res.json=body=>{
  if(!/^\/api\/admin(?:\/|$)/i.test(req.originalUrl)&&body&&typeof body==='object'&&!Array.isArray(body)){
   body={...body};for(const field of ['error','message','notice'])if(typeof body[field]==='string')body[field]=serverMessage(body[field]);
  }
  return json(body);
 };
 next();
}
