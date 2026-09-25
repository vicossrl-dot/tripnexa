import test from 'node:test';
import assert from 'node:assert/strict';
import { hotelMetadata, hotelUrl, publicAddress, fetchHotelPage } from '../hotel-page.js';
import { cleanReservation } from '../stay-extraction.js';
import { documentType, ownedFile } from '../uploads.js';
import { provider } from '../ai.js';
import { autocomplete } from '../places.js';
import { config } from '../config.js';
import { publicProjection } from '../trips.js';
import { inputHash } from '../itinerary-service.js';

test('Hotel URLs reject local/private targets, credentials, redirects to local services and unsafe protocols', async () => {
  for (const address of ['127.0.0.1','10.1.2.3','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2002:7f00:1::']) assert.equal(publicAddress(address), false, address);
  assert(publicAddress('8.8.8.8')); assert(publicAddress('2606:4700:4700::1111'));
  for (const url of ['file:///etc/passwd','https://user:secret@example.com','https://example.com:1234']) assert.throws(() => hotelUrl(url));
  await assert.rejects(fetchHotelPage('http://127.0.0.1/'), /public hotel/);
  await assert.rejects(fetchHotelPage('http://2130706433/'), /public hotel/);
});
test('Hotel HTML extraction uses Hotel structured metadata; challenge pages and generic titles are not success', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'Hotel',name:'Example &amp; Garden',address:{streetAddress:'Example 12',addressLocality:'Barcelona',addressCountry:'ES'},geo:{latitude:41.4,longitude:2.1}}]})}</script>`;
  assert.deepEqual(hotelMetadata(html), {title:'Example & Garden',address:'Example 12, Barcelona, ES',city:'Barcelona',country:'ES',lat:41.4,lng:2.1});
  assert.deepEqual(hotelMetadata('<title>Booking.com</title><script>challenge()</script>'), {});
  const cleaned = cleanReservation({ title:'Test',date:'2026-02-30',end_date:'2026-10-04',check_in_time:'99:99',lat:999,lng:2,confirmation_number:'TEST-ONLY' });
  assert.equal(cleaned.date,''); assert.equal(cleaned.check_in_time,''); assert.equal(cleaned.lat,null); assert.equal(cleaned.end_date,'2026-10-04');
});
test('Private PDF/image references require file ownership and never appear in shared projections', async () => {
  assert.deepEqual(documentType(Buffer.from('%PDF-1.4\n%%EOF')), ['pdf','application/pdf']);
  assert.equal(documentType(Buffer.from('<svg>script</svg>')),null);
  assert.equal(documentType(Buffer.from('%PDF-incomplete')),null);
  await assert.rejects(ownedFile('https://other.example/ticket.pdf','owner'), /private/);
  await assert.rejects(ownedFile('/api/uploads/12345678-1234-1234-1234-123456789abc','owner',{ execute: async (sql,values) => {assert.match(sql,/owner_id=\?/);assert.equal(values[1],'owner');return [[]];} }), /not found/);
  const result=publicProjection({arrival_ticket_url:'/api/uploads/secret',departure_ticket_url:'/api/uploads/secret',reservation_file_url:'private'},[]);
  assert(!JSON.stringify(result).includes('secret'));
});
test('Provider errors distinguish denied key/quota/network without leaking upstream payloads', async () => {
  for(const status of [401,403,429,400,503]) await assert.rejects(provider('responses',{},async()=>new Response(JSON.stringify({error:{code:'TEST_CODE',message:'secret-private-prompt'}}),{status})), error=>error.status===502&&!error.message.includes('secret-private-prompt')&&(/busy|unavailable/i.test(error.message)));
  await assert.rejects(provider('responses',{},async()=>{throw Object.assign(new Error('secret-key'),{cause:{code:'EACCES'}});}), error=>/unavailable/.test(error.message)&&!error.message.includes('EACCES'));
});
test('Places autocomplete filters transport/hotels and uses destination when coordinates are missing', async t => {
  const key=config.googleMapsKey;config.googleMapsKey='fixture';t.after(()=>{config.googleMapsKey=key;});
  await autocomplete('Barcelona','1234567890123456',async(_url,options)=>{const body=JSON.parse(options.body);assert.deepEqual(body.includedPrimaryTypes,['airport']);assert.equal(body.input,'Barcelona');return new Response('{"suggestions":[]}');},null,'airport','Barcelona');
  await autocomplete('Sagrada','1234567890123456',async(_url,options)=>{assert.equal(JSON.parse(options.body).input,'Sagrada, Barcelona');return new Response('{"suggestions":[]}');},null,'','Barcelona');
});
test('Adding optional location columns or private attachments does not invalidate existing itineraries', () => {
  const old = { trip: {name:'Old trip',country:null},places:[],tripItems:[{title:'Old hotel'}],dayWindows:[] };
  const upgraded = { ...old,trip:{...old.trip,arrival_lat:null,departure_place_id:null,arrival_ticket_url:'/api/uploads/private'},tripItems:[{...old.tripItems[0],city:null,country:null,reservation_file_url:'/api/uploads/private'}] };
  assert.equal(inputHash(old),inputHash(upgraded));
  assert.notEqual(inputHash(old),inputHash({...upgraded,trip:{...upgraded.trip,arrival_lat:41}}));
});
