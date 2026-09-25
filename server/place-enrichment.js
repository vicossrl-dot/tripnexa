import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { google, placesRouter } from './places.js';
import { assert } from './errors.js';
import { normalizePlaceName } from '../src/lib/place-matching.js';

const secret = randomBytes(32);
const idPattern = /^[A-Za-z0-9_-]{1,255}$/;
const fields = 'id,displayName,formattedAddress,addressComponents,location,primaryType,businessStatus';
const headers = mask => ({ 'Content-Type':'application/json', 'X-Goog-Api-Key':config.googleMapsKey, 'X-Goog-FieldMask':mask });
const mapPlace = place => {
  const component = type => place.addressComponents?.find(row => row.types?.includes(type))?.longText || null;
  return { name:place.displayName?.text || '', address:place.formattedAddress || null, place_id:place.id,
    city:component('locality') || component('postal_town'), country:component('country'),
    lat:place.location?.latitude ?? null, lng:place.location?.longitude ?? null, category:place.primaryType || null };
};
export async function resolvePlace(body, fetchImpl = fetch) {
  assert(typeof body?.name === 'string' && body.name.trim() && body.name.length <= 200,400,'Enter a place name.');
  assert(typeof body.destination === 'string' && body.destination.length <= 200,400,'Enter the destination.');
  if (body.place_id) {
    assert(idPattern.test(body.place_id),400,'Invalid place ID.');
    const place = await google('https://places.googleapis.com/v1/places/'+body.place_id,{headers:headers(fields)},fetchImpl);
    assert(place.businessStatus!=='CLOSED_PERMANENTLY',422,'This place is listed as permanently closed. Choose another place or verify your existing reservation.');
    return { place:mapPlace(place), candidates:[] };
  }
  const result = await google('https://places.googleapis.com/v1/places:searchText', {
    method:'POST',headers:headers(fields.split(',').map(field=>'places.'+field).join(',')),
    body:JSON.stringify({textQuery:`${body.name}, ${body.destination}`,pageSize:3}),
  },fetchImpl);
  const candidates=(result.places || []).filter(place=>place.businessStatus!=='CLOSED_PERMANENTLY').map(mapPlace);
  const exact=candidates.filter(place=>normalizePlaceName(place.name)===normalizePlaceName(body.name));
  // Ambiguous names/translations require a human choice, never silently pick the first hit.
  return {place:exact.length===1?exact[0]:null,candidates};
}
const sign = payload => createHmac('sha256',secret).update(payload).digest('base64url');
const safeGoogleLink = value => {
  try { const url=new URL(value?.startsWith('//')?'https:'+value:value); return url.protocol==='https:' && (url.hostname==='google.com'||url.hostname.endsWith('.google.com')||url.hostname.endsWith('.googleusercontent.com')||url.hostname==='maps.app.goo.gl') ? url.href : null; } catch { return null; }
};
export async function placePhotos(placeId, owner, fetchImpl = fetch) {
  assert(idPattern.test(placeId),400,'Invalid place ID.');
  const result=await google('https://places.googleapis.com/v1/places/'+placeId,{headers:headers('photos')},fetchImpl);
  return (result.photos || []).slice(0,4).map(photo=>{
    const payload=Buffer.from(JSON.stringify({name:photo.name,owner,expires:Date.now()+15*60000})).toString('base64url');
    return {url:'/api/places/photo/'+payload+'.'+sign(payload),
      source:safeGoogleLink(photo.googleMapsUri),
      authors:(photo.authorAttributions||[]).map(author=>({name:author.displayName || 'Contributor',url:safeGoogleLink(author.uri)}))};
  });
}
placesRouter.post('/resolve',async(req,res)=>res.set('Cache-Control','no-store').json(await resolvePlace(req.body)));
placesRouter.get('/:id/photos',async(req,res)=>res.set('Cache-Control','no-store').json({photos:await placePhotos(req.params.id,req.user.id)}));
placesRouter.get('/photo/:token',async(req,res)=>{
  const [payload,signature]=req.params.token.split('.');
  assert(payload?.length<=6000 && signature?.length===43 && timingSafeEqual(Buffer.from(sign(payload)),Buffer.from(signature)),404,'Photo expired. Reload suggestions.');
  let data;try{data=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{assert(false,404,'Photo unavailable.');}
  assert(data.owner===req.user.id && data.expires>Date.now() && /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(data.name),404,'Photo expired. Reload suggestions.');
  const result=await google(`https://places.googleapis.com/v1/${data.name}/media?maxWidthPx=1200&skipHttpRedirect=true`,{headers:headers('')},fetch);
  const url=safeGoogleLink(result.photoUri);
  assert(url && new URL(url).hostname.endsWith('.googleusercontent.com'),502,'Photo unavailable.');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000)});
  assert(response.ok && /^image\/(jpeg|png|webp|gif)$/.test(response.headers.get('content-type') || ''),502,'Photo unavailable.');
  const chunks=[];let bytes=0;for await(const chunk of response.body){bytes+=chunk.length;assert(bytes<=8*1024*1024,502,'Photo too large.');chunks.push(chunk);}
  res.set({'Cache-Control':'no-store','Content-Type':response.headers.get('content-type'),'X-Content-Type-Options':'nosniff'}).send(Buffer.concat(chunks));
});
