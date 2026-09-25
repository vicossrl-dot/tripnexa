import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { assert, HttpError } from './errors.js';
import { providerError } from './provider-errors.js';
import {providerQuota,runtimeSettings} from './admin/runtime.js';
import {recordProvider} from './admin/telemetry.js';

const sessionPattern = /^[a-zA-Z0-9_-]{16,36}$/;
function session(value) {
  assert(typeof value === 'string' && sessionPattern.test(value), 400, 'Invalid autocomplete session.');
  return value;
}
export async function google(url, options, fetchImpl) {
  const operation=url.includes(':computeRoutes')?'routes':url.includes('/media?')?'photo':url.includes('/timezone/')?'timezone':url.includes(':autocomplete')?'autocomplete':url.includes(':searchText')?'search':'details';
  if(operation==='timezone')assert(runtimeSettings()?.settings.google_timezone_enabled!==false,503,'Timezone lookup is disabled.');
  await providerQuota('google',operation);const began=Date.now();let status=null;
  assert(config.googleMapsKey, 503, 'Destination suggestions are unavailable. Enter your destination manually.');
  try {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(8000) });
    status=response.status;
    const result = await response.json();
    if (!response.ok || result.error) throw providerError('Google Places', { status: response.status, code: result.error?.status });
    await recordProvider({provider:'google',operation,success:true,latency:Date.now()-began,status});return result;
  } catch (cause) {await recordProvider({provider:'google',operation,success:false,latency:Date.now()-began,status}); if (cause instanceof HttpError) throw cause; throw providerError('Google Places', { cause }); }
}
export async function autocomplete(input, sessionToken, fetchImpl = fetch, bias = null, kind = '', destination = '') {
  assert(typeof input === 'string' && input.trim().length >= 2 && input.length <= 200, 400, 'Enter 2–200 characters.');
  assert(!bias || (Number.isFinite(bias.latitude) && Math.abs(bias.latitude) <= 90 && Number.isFinite(bias.longitude) && Math.abs(bias.longitude) <= 180), 400, 'Invalid search location.');
  const types = { airport: ['airport'], train: ['train_station'], ship: ['ferry_terminal'], bus: ['bus_station'], hotel: ['hotel', 'lodging'] };
  assert(!kind || Object.hasOwn(types, kind), 400, 'Invalid place category.');
  assert(typeof destination === 'string' && destination.length <= 200, 400, 'Invalid destination context.');
  const result = await google('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.googleMapsKey, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text' },
    body: JSON.stringify({ input: input.trim() + (!bias && destination && !input.toLowerCase().includes(destination.toLowerCase()) ? `, ${destination}` : ''), sessionToken: session(sessionToken), includeQueryPredictions: false,
      ...(kind ? { includedPrimaryTypes: types[kind] } : {}),
      ...(bias ? { locationBias: { circle: { center: bias, radius: 50000 } } } : {}) }),
  }, fetchImpl);
  return (result.suggestions || []).flatMap(item => {
    const p = item.placePrediction;
    return p?.placeId && p?.text?.text ? [{ place_id: p.placeId, description: p.text.text }] : [];
  }).slice(0, 5);
}
export async function placeDetails(placeId, sessionToken, fetchImpl = fetch, purpose = 'destination') {
  assert(['destination', 'place'].includes(purpose), 400, 'Invalid place purpose.');
  assert(typeof placeId === 'string' && /^[a-zA-Z0-9_-]{1,255}$/.test(placeId), 400, 'Invalid place ID.');
  const query = new URLSearchParams({ sessionToken: session(sessionToken) });
  const place = await google(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${query}`, {
    headers: { 'X-Goog-Api-Key': config.googleMapsKey, 'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,location' + (purpose === 'place' ? ',primaryType,types,businessStatus' : '') },
  }, fetchImpl);
  assert(place.id && (place.displayName?.text || place.formattedAddress), 502, 'This destination could not be resolved. Please enter it manually.');
  assert(purpose!=='place'||place.businessStatus!=='CLOSED_PERMANENTLY',422,'This place is listed as permanently closed. Choose another place or verify your existing reservation.');
  const component = type => place.addressComponents?.find(c => c.types?.includes(type))?.longText || null;
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  const hasCoordinates = Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  if (purpose === 'place') return {
    name: place.displayName?.text || place.formattedAddress, address: place.formattedAddress || null,
    city: component('locality') || component('postal_town') || component('administrative_area_level_3'),
    country: component('country'), place_id: place.id, lat: hasCoordinates ? latitude : null, lng: hasCoordinates ? longitude : null,
    category: place.primaryType || place.types?.find(type => !['point_of_interest', 'establishment'].includes(type)) || null,
  };
  let timezone = null;
  if (hasCoordinates) {
    try {
      const params = new URLSearchParams({ location: `${latitude},${longitude}`, timestamp: String(Math.floor(Date.now() / 1000)), key: config.googleMapsKey });
      const result = await google(`https://maps.googleapis.com/maps/api/timezone/json?${params}`, {}, fetchImpl);
      if (result.status === 'OK' && typeof result.timeZoneId === 'string') timezone = result.timeZoneId;
    } catch { /* A timezone failure must not discard a successfully selected place. */ }
  }
  return {
    destination: place.displayName?.text || place.formattedAddress,
    destination_city: component('locality') || component('postal_town') || component('administrative_area_level_3'),
    country: component('country'), destination_formatted_address: place.formattedAddress || null,
    destination_place_id: place.id, destination_latitude: hasCoordinates ? latitude : null,
    destination_longitude: hasCoordinates ? longitude : null, timezone,
  };
}
export const placesRouter = Router();
placesRouter.use(rateLimit({ windowMs: 60000, limit: 60, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please pause briefly, or enter the destination manually.' } }));
placesRouter.post('/autocomplete', async (req, res) => res.json({ suggestions: await autocomplete(req.body?.input, req.body?.sessionToken, fetch, req.body?.bias, req.body?.kind, req.body?.destination) }));
placesRouter.post('/details', async (req, res) => res.json(await placeDetails(req.body?.placeId, req.body?.sessionToken, fetch, req.body?.purpose)));
