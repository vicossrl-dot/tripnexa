import en from './locales/en.json' with { type: 'json' };
import ro from './locales/ro.json' with { type: 'json' };
import ru from './locales/ru.json' with { type: 'json' };
import de from './locales/de.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import {serverCatalogs,serverSourceKeys} from './server-messages.js';

export const locales = ['en', 'ro', 'ru', 'de', 'fr', 'es'];
export const localeNames = { en: 'English', ro: 'Română', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español' };
const catalogs = { en, ro, ru, de, fr, es };
export const normalizeLocale = value => typeof value === 'string' && locales.includes(value.toLowerCase().split(/[-_]/)[0]) ? value.toLowerCase().split(/[-_]/)[0] : null;
/** @param {{explicit?: string|null, authenticated?: string|null, local?: string|null, browser?: readonly string[]}} [preferences] */
export function resolveLocale({ explicit, authenticated, local, browser = [] } = {}) {
  return normalizeLocale(explicit) || normalizeLocale(authenticated) || normalizeLocale(local) || browser.map(normalizeLocale).find(Boolean) || 'en';
}
const read = (storage, key) => { try { return globalThis[storage]?.getItem(key) || null; } catch { return null; } };
const write = (storage, key, value) => { try { if (value === null) globalThis[storage]?.removeItem(key); else globalThis[storage]?.setItem(key, value); } catch { /* Language selection also works when storage is unavailable. */ } };
let locale = resolveLocale({ local: read('localStorage', 'tripnexa.locale'), browser: globalThis.navigator?.languages || [] });
let explicit = normalizeLocale(read('sessionStorage', 'tripnexa.locale.pending'));
if (explicit) locale = explicit;
const listeners = new Set();
let revision=0;
export const getLocaleSnapshot=()=>getLocale()+':'+revision;
let generatedTranslations={};
export function setGeneratedTranslations(translations,merge=false){generatedTranslations=merge?{...generatedTranslations,...translations}:translations||{};notify();}
export const isAdmin = () => /^\/admin(?:\/|$)/i.test(globalThis.location?.pathname || '');
export const getLocale = () => isAdmin() ? 'en' : locale;
export const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
function notify() { revision++; if (globalThis.document) document.documentElement.lang = getLocale(); listeners.forEach(listener => listener()); }
export function selectLocale(next) {
  if (!locales.includes(next)) return;
  explicit = next;
  write('sessionStorage', 'tripnexa.locale.pending', next);
  write('localStorage', 'tripnexa.locale', next);
  locale = next;
  generatedTranslations={};
  notify();
}
export function applyUserLocale(saved) {
  locale = resolveLocale({ explicit, authenticated: saved, local: read('localStorage', 'tripnexa.locale'), browser: globalThis.navigator?.languages || [] });
  notify();
}
export const refreshDocumentLocale = notify;
export const pendingLocale = () => explicit;
export function acknowledgeLocale(saved) { if (explicit === saved) { explicit = null; write('sessionStorage', 'tripnexa.locale.pending', null); } }
/** @param {string} key @param {Record<string, unknown>} [values] */
export function t(key, values = {}) {
  const language = getLocale();
  const category = values.count === undefined ? null : new Intl.PluralRules(language).select(Number(values.count));
  const pluralKey = category ? key + '.' + category : key;
  const fallbackPluralKey = values.count === undefined ? key : key + '.' + (Number(values.count) === 1 ? 'one' : 'other');
  const text = serverCatalogs[language][key] ?? serverCatalogs[language][serverSourceKeys.get(en[key])] ?? catalogs[language][pluralKey] ?? catalogs[language][key] ?? catalogs[language][fallbackPluralKey] ?? en[pluralKey] ?? en[key] ?? en[fallbackPluralKey] ?? key;
  return text.replace(/\{\{(\w+)\}\}/g, (match, name) => values[name] === undefined ? match : name === 'count' && Number.isFinite(Number(values[name])) ? new Intl.NumberFormat(language).format(Number(values[name])) : String(values[name]));
}
const sourceKeys = new Map(Object.entries(en).map(([key, text]) => [text, key]));
const serverReverseKeys=new Map(Object.values(serverCatalogs).flatMap(catalog=>Object.entries(catalog).map(([key,text])=>[text,key])));
const templates = [...Object.entries(en),...Object.values(serverCatalogs).flatMap(Object.entries)].filter(([, text]) => text.includes('{{') && /[\p{L}]{3}/u.test(text.replace(/\{\{\w+\}\}/g, ''))).sort((a,b)=>b[1].replace(/\{\{\w+\}\}/g,'').length-a[1].replace(/\{\{\w+\}\}/g,'').length).map(([key, text]) => {
  const names = [];
  const pattern = text.split(/(\{\{\w+\}\})/).map(part => {
    const match = part.match(/^\{\{(\w+)\}\}$/);
    if (match) { names.push(match[1]); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('');
  return { key, names, pattern: new RegExp('^' + pattern + '$', 's') };
});
// Only translate catalogued application copy. User content and provider responses stay intact.
export function translateText(value) {
  if (typeof value !== 'string' || isAdmin()) return value;
  if(Object.hasOwn(generatedTranslations,value))return generatedTranslations[value];
  const serverKey=serverSourceKeys.get(value)||serverReverseKeys.get(value);if(serverKey)return t(serverKey);
  const key = sourceKeys.get(value);
  if (key) return t(key);
  const quantity = value.match(/^(\d+) (days?|adults?|children|child|visits?|transfers?|files?|places?|nights?|credits?)$/);
  const countKeys = { day: 'days', days: 'days', adult: 'adults', adults: 'adults', child: 'children', children: 'children', visit: 'visits', visits: 'visits', transfer: 'transfers', transfers: 'transfers', file: 'files', files: 'files', place: 'places', places: 'places', night: 'nights', nights: 'nights', credit: 'credits', credits: 'credits' };
  if (quantity) return t('counts.' + countKeys[quantity[2]], { count: Number(quantity[1]) });
  if (value.includes(' · ')) return value.split(' · ').map(part => translateText(part)).join(' · ');
  for (const template of templates) {
    const match = value.match(template.pattern);
    if (match) return t(template.key, Object.fromEntries(template.names.map((name, index) => [name, match[index + 1]])));
  }
  return value;
}
export const formatNumber = (value, options = {}) => new Intl.NumberFormat(getLocale(), options).format(Number(value));
export const formatCurrency = (value, currency = 'USD') => formatNumber(value, { style: 'currency', currency: currency.toUpperCase() });
export function formatDate(value, options = {}) {
  const date = value instanceof Date ? value : new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? value + 'T12:00:00' : value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(getLocale(), options).format(date);
}
export function formatAppDate(value, pattern) {
  const month = /MMMM/.test(pattern) ? 'long' : /MMM/.test(pattern) ? 'short' : '2-digit';
  const options = { day: /dd/.test(pattern) ? '2-digit' : 'numeric', month };
  if (/y/.test(pattern)) options.year = /yyyy/.test(pattern) ? 'numeric' : '2-digit';
  if (/EEE/.test(pattern)) options.weekday = /EEEE/.test(pattern) ? 'long' : 'short';
  return formatDate(value, options);
}
notify();
