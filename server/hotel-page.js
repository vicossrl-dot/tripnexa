import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { assert } from './errors.js';

export function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && [0,168].includes(b) || a === 100 && b >= 64 && b <= 127 || a === 198 && [18,19,51].includes(b) || a === 203 && b === 0);
  }
  // Only global unicast IPv6; reject mapped IPv4, ULA, link-local and transition ranges.
  return isIP(address) === 6 && /^[23]/.test(address) && !/^200[12]:/i.test(address) && !/^2001:(db8|0):/i.test(address);
}
export function hotelUrl(value) {
  let url;
  try { url = new URL(value); } catch { assert(false, 400, 'Enter a valid public hotel URL.'); }
  assert(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.port && value.length <= 2000, 400, 'Use a public HTTP(S) hotel URL without credentials or custom ports.');
  return url;
}
export async function fetchHotelPage(value, redirects = 0, deadline = Date.now() + 18000) {
  const url = hotelUrl(value);
  assert(redirects <= 3 && Date.now() < deadline, 422, 'The hotel page did not load in time. Upload a confirmation or enter the hotel manually.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const records = await lookup(hostname, { all: true });
  assert(records.length && records.every(record => publicAddress(record.address)), 400, 'Only public hotel websites can be imported.');
  // Pin validated DNS records for the request, preventing DNS rebinding.
  const result = await new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      lookup: (_name, options, callback) => options.all ? callback(null, records) : callback(null, records[0].address, records[0].family),
      headers: { 'User-Agent': 'TripSync/1.0 (hotel information preview)', Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
      signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    }, response => {
      if ([301,302,303,307,308].includes(response.statusCode)) {
        response.resume(); resolve({ redirect: response.headers.location }); return;
      }
      if (response.statusCode !== 200 || !/text\/html|application\/xhtml\+xml/i.test(response.headers['content-type'] || '')) {
        response.resume(); resolve({ status: response.statusCode, html: '' }); return;
      }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) { response.destroy(); reject(new Error('Hotel page is too large.')); }
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, html: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
  });
  if (result.redirect) return fetchHotelPage(new URL(result.redirect, url).href, redirects + 1, deadline);
  return { ...result, url: url.href };
}
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').trim().slice(0,1000) : '';
export function hotelMetadata(html) {
  const nodes = [];
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12 || nodes.length > 1000) return;
    if (!Array.isArray(value)) nodes.push(value);
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, depth + 1);
  }
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* Other valid metadata may remain. */ }
  }
  const hotel = nodes.find(node => [node['@type']].flat().some(type => /^(Hotel|LodgingBusiness|Resort|Motel|Hostel|BedAndBreakfast|VacationRental)$/.test(type)));
  const address = hotel?.address;
  const geo = hotel?.geo;
  const data = hotel ? {
    title: clean(hotel.name), address: typeof address === 'string' ? clean(address) : [address?.streetAddress,address?.addressLocality,address?.postalCode,address?.addressCountry?.name || address?.addressCountry].map(clean).filter(Boolean).join(', '),
    city: clean(address?.addressLocality), country: clean(address?.addressCountry?.name || address?.addressCountry),
    lat: geo?.latitude != null && Number.isFinite(Number(geo.latitude)) ? Number(geo.latitude) : null,
    lng: geo?.longitude != null && Number.isFinite(Number(geo.longitude)) ? Number(geo.longitude) : null,
  } : {};
  // Hotel-specific metadata only; a generic Booking homepage title is not a hotel.
  const meta = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1].toLowerCase(), clean(m[3])]));
    if (attrs.property || attrs.name) meta[attrs.property || attrs.name] = attrs.content;
  }
  if (!data.title && /hotel|lodging/i.test(meta['og:type'] || '')) {
    data.title = meta['og:title'] || '';
    data.address = meta['hotel:street_address'] || '';
    data.city = meta['hotel:locality'] || '';
    data.country = meta['hotel:country_name'] || '';
  }
  return data;
}
