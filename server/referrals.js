import { readFile } from 'node:fs/promises';
import { config } from './config.js';
import { normalizePlaceName } from '../src/lib/place-matching.js';
import {runtimeSettings} from './admin/runtime.js';

export function bookingLink(settings, trip, item) {
  if (item.step_type !== 'visit' || !['needed', 'to_verify'].includes(item.ticket_status)) return null;
  const rules = Array.isArray(settings?.rules) ? settings.rules : [];
  for (const rule of rules) {
    // Identity is explicit: no category-wide links to unrelated products.
    const match = rule.place_id ? rule.place_id === item.place_id : rule.selection_id ? rule.selection_id === item.selection_id :
      rule.name && rule.destination && normalizePlaceName(rule.name) === normalizePlaceName(item.title) && normalizePlaceName(rule.destination) === normalizePlaceName(trip.destination);
    if (!match) continue;
    const values = { name: item.title, destination: trip.destination, place_id: item.place_id, date: item.date, selection_id: item.selection_id };
    const template = rule.url || rule.url_template;
    if (typeof template !== 'string' || template.length > 3000) continue;
    let missing = false;
    const href = template.replace(/\{([^}]+)\}/g, (_match, key) => {
      if (!Object.hasOwn(values, key) || !values[key]) missing = true;
      return encodeURIComponent(values[key] || '');
    });
    try {
      const url = new URL(href);
      if (missing || url.protocol !== 'https:' || url.username || url.password || !settings.allowed_hosts?.includes(url.hostname) || /[{}]/.test(href)) continue;
      return { url: url.href, label: 'Book / Buy ticket' };
    } catch { /* Invalid admin rules never break an itinerary. */ }
  }
  return null;
}
export async function withBookingLinks(trip, items) {
  if(runtimeSettings()?.features.referral_links===false)return items.map(item=>({...item,booking:null}));
  let settings = null;
  try { settings = JSON.parse((await readFile(config.referralFile, 'utf8')).replace(/^\uFEFF/, '')); }
  catch { /* Absent or invalid configuration means no booking actions. */ }
  return items.map(item => {
    let booking=bookingLink(settings,trip,item);
    if(!booking&&item.step_type==='visit'&&['needed','to_verify'].includes(item.ticket_status)&&item.source_url){
      try{const url=new URL(item.source_url);if(url.protocol==='https:'&&!url.username&&!url.password)booking={url:url.href,label:'Find tickets / Official source'};}catch{/* No invented links. */}
    }
    return {...item,booking};
  });
}
