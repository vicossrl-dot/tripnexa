import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { autocomplete, placeDetails } from '../places.js';
import { generateTripNames, validateTripNames } from '../ai.js';
import { config } from '../config.js';
import { validateData } from '../schema.js';
import { pool } from '../db.js';
import { TRAVEL_TYPES, travelBackground } from '../../src/lib/travel-types.js';

test.after(() => pool.end());
const session = '12345678-1234-1234-1234-123456789abc';
const response = data => ({ ok: true, json: async () => data });
test('Places uses fixed Google endpoints and server headers, resolves city/country/coordinates/timezone', async t => {
  const old = config.googleMapsKey; config.googleMapsKey = 'test-secret-google';
  t.after(() => { config.googleMapsKey = old; });
  const predictions = await autocomplete('Rome', session, async (url, options) => {
    assert.equal(url, 'https://places.googleapis.com/v1/places:autocomplete');
    assert.equal(options.headers['X-Goog-Api-Key'], 'test-secret-google');
    assert.equal(JSON.parse(options.body).sessionToken, session);
    return response({ suggestions: [{ placePrediction: { placeId: 'place_1', text: { text: 'Rome, Italy' } } }, { queryPrediction: {} }] });
  });
  assert.deepEqual(predictions, [{ place_id: 'place_1', description: 'Rome, Italy' }]);
  let calls = 0;
  const details = await placeDetails('place_1', session, async (url, options) => {
    calls++;
    if (calls === 1) {
      assert(url.startsWith('https://places.googleapis.com/v1/places/place_1?'));
      assert.equal(options.headers['X-Goog-Api-Key'], config.googleMapsKey);
      return response({ id: 'place_1', displayName: { text: 'Rome' }, formattedAddress: 'Rome, Italy', addressComponents: [{ longText: 'Rome', types: ['locality'] }, { longText: 'Italy', types: ['country'] }], location: { latitude: 41.9, longitude: 12.5 } });
    }
    assert.equal(new URL(url).hostname, 'maps.googleapis.com');
    return response({ status: 'OK', timeZoneId: 'Europe/Rome' });
  });
  assert.equal(calls, 2);
  assert.deepEqual(details, { destination: 'Rome', destination_city: 'Rome', country: 'Italy', destination_formatted_address: 'Rome, Italy', destination_place_id: 'place_1', destination_latitude: 41.9, destination_longitude: 12.5, timezone: 'Europe/Rome' });
  assert(!JSON.stringify(details).includes('secret'));
});
test('Places tolerates missing optional details and timezone failures; invalid requests never reach Google', async t => {
  const old = config.googleMapsKey; config.googleMapsKey = 'test-key'; t.after(() => { config.googleMapsKey = old; });
  const details = await placeDetails('p1', session, async url => {
    if (url.includes('timezone')) throw new Error('timeout with secret');
    return response({ id: 'p1', displayName: { text: 'Mountains' }, location: { latitude: 1, longitude: 2 } });
  });
  assert.equal(details.timezone, null); assert.equal(details.country, null); assert.equal(details.destination_latitude, 1);
  const never = async () => { assert.fail('Unexpected external call'); };
  await assert.rejects(() => placeDetails('../metadata', session, never), /Invalid place/);
  await assert.rejects(() => autocomplete('Rome', 'bad', never), /session/);
  await assert.rejects(() => autocomplete('a', session, never), /characters/);
  await assert.rejects(() => autocomplete('Rome', session, async () => { throw new Error('provider secret'); }), error => error.status === 502 && !error.message.includes('secret'));
  config.googleMapsKey = '';
  await assert.rejects(() => autocomplete('Rome', session, never), error => error.status === 503);
});
test('Trip names validate three short distinct choices and keep AI errors usable', async t => {
  const old = [config.aiKey, config.aiModel]; config.aiKey = 'test-secret-ai'; config.aiModel = 'configured-test-model';
  t.after(() => { [config.aiKey, config.aiModel] = old; });
  const data = { destination: 'Rome', travel_type: 'train' };
  const result = await generateTripNames(data, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-secret-ai');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(JSON.parse(body.input).travel_type, 'train');
    return response({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ names: ['Roman Holiday', 'Roam Rome', 'Roman Tracks'] }) }] }] });
  });
  assert.equal(result.source, 'ai'); assert.equal(result.names.length, 3);
  for (const invalid of [['Too many words here', 'Rome', 'Go'], ['Rome','Rome','Go'], ['<script>','Go','Trip']]) assert.throws(() => validateTripNames(invalid));
  const failed = await generateTripNames(data, async () => { throw new Error('private provider failure'); });
  assert.equal(failed.source, 'fallback'); validateTripNames(failed.names); assert(!JSON.stringify(failed).includes('private'));
  const malformed = await generateTripNames(data, async () => response({ output: [] }));
  assert.equal(malformed.source, 'fallback');
  config.aiKey = '';
  const offline = await generateTripNames(data, async () => { assert.fail('No API call without a key'); });
  assert.equal(offline.source, 'fallback');
  await assert.rejects(() => generateTripNames({ destination: '' }), /destination/);
});
test('Travel metadata remains optional and every travel type has an existing local image', async () => {
  assert.deepEqual(validateData('Trip', { name: 'Old trip' }), { name: 'Old trip' });
  const longPlaceId = 'a'.repeat(120);
  assert.equal(validateData('Trip', { name: 'Test', destination_place_id: longPlaceId }).destination_place_id, longPlaceId);
  assert.throws(() => validateData('Trip', { name: 'Test', travel_type: 'spaceship' }), /travel_type/);
  assert.throws(() => validateData('Trip', { name: 'Test', destination_latitude: 91 }), /latitude/);
  assert.throws(() => validateData('Trip', { name: 'Test', destination_longitude: -181 }), /longitude/);
  for (const type of [...TRAVEL_TYPES.map(t => t.value), undefined, 'unknown']) {
    const asset = travelBackground(type); assert(asset.startsWith('/media/travel/')); await access('public' + asset);
  }
});
