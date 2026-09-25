import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config.js';
import { pool } from '../db.js';
import { autocomplete, placeDetails } from '../places.js';
import { planningContext, generatePlanningSuggestions, violatesExclusions } from '../planning-suggestions.js';
import { validateData } from '../schema.js';
import { samePlace } from '../../src/lib/place-matching.js';
import { buildItinerary, simulateSelection } from '../../src/lib/planningEngine.js';

test.after(() => pool.end());
const session = '12345678-1234-1234-1234-123456789abc';
const suggestion = (name, extra = {}) => ({ name, aliases: [], fit_reason: 'A compact outdoor visit near your stay.', category: 'nature', area: 'Centro', address: '', visit_duration_min: 45, best_time_of_day: 'morning', indoor_outdoor: 'outdoor', ...extra });
const output = data => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
test('Desired place details and destination bias preserve structured data without a timezone call', async t => {
  const previous = config.googleMapsKey; config.googleMapsKey = 'server-only'; t.after(() => { config.googleMapsKey = previous; });
  await autocomplete('Colo', session, async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.deepEqual(body.locationBias.circle.center, { latitude: 41.9, longitude: 12.5 });
    return { ok: true, json: async () => ({ suggestions: [] }) };
  }, { latitude: 41.9, longitude: 12.5 });
  let calls = 0;
  const result = await placeDetails('a'.repeat(120), session, async (_url, options) => {
    calls++; assert(options.headers['X-Goog-FieldMask'].includes('primaryType'));
    return { ok: true, json: async () => ({ id: 'a'.repeat(120), displayName: { text: 'Colosseum' }, formattedAddress: 'Piazza del Colosseo, Rome', location: { latitude: 41.89, longitude: 12.49 }, primaryType: 'historical_landmark', addressComponents: [{ longText: 'Rome', types: ['locality'] }, { longText: 'Italy', types: ['country'] }] }) };
  }, 'place');
  assert.equal(calls, 1); assert.equal(result.city, 'Rome'); assert.equal(result.country, 'Italy'); assert.equal(result.category, 'historical_landmark'); assert.equal(result.lat, 41.89);
  assert.equal(validateData('PlaceSelection', { trip_id: 'trip', ...result, selection_source: 'google' }).place_id.length, 120);
  assert.throws(() => validateData('PlaceSelection', { trip_id: 'trip', name: 'Bad', lat: 91 }), /latitude/);
  await assert.rejects(() => autocomplete('Colo', session, async () => assert.fail(), { latitude: 100, longitude: 0 }), /location/);
});
test('Planning context includes every preference and logistics but excludes private credentials and files', () => {
  const context = planningContext({ destination: 'Rome', start_date: '2026-10-01', end_date: '2026-10-03', travel_type: 'train', stroller: true, max_walk_per_day_min: 0, mobility_needs: 'Step-free', interests: 'Nature', exclusions: 'No museums', pace: 'relaxed', transport_preference: 'taxi', max_walk_per_segment_min: 10, meal_duration_min: 90, buffer_min: 20, share_token: 'secret' }, [], [{ category: 'stay', title: 'Hotel', address: 'Centro', lat: 41.9, lng: 12.5, confirmation_number: 'secret', image_url: '/private', notes: 'secret' }], [{ date: '2026-10-01', windows: '[{"start":"09:00","end":"18:00"}]', blocked: '[{"start":"13:00","end":"14:00"}]' }]);
  assert.equal(context.trip.duration_days, 3); assert.equal(context.trip.max_walk_per_day_min, 0); assert.equal(context.trip.stroller, true);
  for (const field of ['travel_type','mobility_needs','interests','exclusions','pace','transport_preference','max_walk_per_segment_min','meal_duration_min','buffer_min']) assert(context.trip[field] != null, field);
  assert.equal(context.stays[0].address, 'Centro'); assert.equal(context.day_windows[0].blocked.length, 1);
  assert(!JSON.stringify(context).includes('secret')); assert(!JSON.stringify(context).includes('/private'));
});
test('AI uses the configured model, strict JSON, context and filters desired places, aliases, duplicates and exclusions', async t => {
  const previous = [config.aiKey, config.aiModel]; config.aiKey = 'server-secret'; config.aiModel = 'existing-model'; t.after(() => { [config.aiKey, config.aiModel] = previous; });
  const context = planningContext({ destination: 'Rome', exclusions: 'No museums,No shopping,No water activities,No difficult trails' }, [{ name: 'Colosseum' }, { name: 'Rejected Park', priority: 'excluded' }], [], []);
  const response = await generatePlanningSuggestions(context, async (path, body) => {
    assert.equal(path, 'responses'); assert.equal(body.model, 'existing-model'); assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
    assert.deepEqual(JSON.parse(body.input), context); assert(body.instructions.includes('Exclusions override interests'));
    return output({ suggestions: [suggestion('Colosseo', { aliases: ['Colosseum'] }), suggestion('Rejected Park'), suggestion('Garden'), suggestion('Gárden!'), suggestion('Museum of Rome', { category: 'museum' }), suggestion('Mall', { category: 'shopping' }), suggestion('Boat cruise', { category: 'water_activity' }), suggestion('Difficult trail', { category: 'difficult_trail' }), suggestion('Park viewpoint')] });
  });
  assert.deepEqual(response.suggestions.map(item => item.name), ['Garden', 'Park viewpoint']);
  assert(samePlace({ name: 'Trevi Fountain' }, { name: 'Trevi Fountain, Rome' }));
  assert(!samePlace({ name: 'Cafe', place_id: 'one' }, { name: 'Cafe', place_id: 'two' }));
  assert(violatesExclusions(suggestion('Shopping district', { category: 'other' }), 'No shopping'));
  assert(violatesExclusions(suggestion('Vatican Gardens'), 'Avoid Vatican Gardens'));
  await assert.rejects(() => generatePlanningSuggestions(context, async () => output({ suggestions: [{ name: 'invalid' }] })), /format/);
  await assert.rejects(() => generatePlanningSuggestions(context, async () => ({ output: [] })), /incomplete/);
  config.aiKey = '';
  await assert.rejects(() => generatePlanningSuggestions(context, async () => assert.fail('No provider call without key')), error => error.status === 503);
});
test('Accepted preferred places fit after mandatory visits, only once; rejected places never enter the itinerary', () => {
  const trip = { id: 'trip' };
  const dayWindows = ['2026-10-01','2026-10-02'].map(date => ({ date, windows: '[{"start":"09:00","end":"18:00"}]', blocked: '[]' }));
  const mandatory = { name: 'Mandatory', priority: 'mandatory', desired_duration_min: 60 };
  const preferred = { name: 'Accepted park', priority: 'preferred', desired_duration_min: 45 };
  const result = buildItinerary({ trip, dayWindows, places: [mandatory, preferred, { name: 'Rejected', priority: 'excluded' }] });
  assert.equal(result.items.filter(item => item.title === 'Accepted park').length, 1);
  assert(!result.items.some(item => item.title === 'Rejected'));
  assert.equal(result.items.find(item => item.title === 'Accepted park').ticket_status, 'to_verify');
  const baseline = buildItinerary({ trip, dayWindows, places: [mandatory] });
  assert.deepEqual(result.items.filter(item => item.title === 'Mandatory'), baseline.items.filter(item => item.title === 'Mandatory'));
  const simulation = simulateSelection({ trip, dayWindows: [{ date: '2026-10-01', windows: '[{"start":"09:00","end":"09:30"}]' }], currentPlaces: [], candidate: { place: preferred, add: true } });
  assert.equal(simulation.feasible, false);
});
