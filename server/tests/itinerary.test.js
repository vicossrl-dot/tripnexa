import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleItinerary, movement, tripDates } from '../itinerary-engine.js';
import { proposeItinerary } from '../itinerary-ai.js';
import { bookingLink } from '../referrals.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { buildMapsLink } from '../../src/lib/planningEngine.js';
test.after(() => pool.end());
const place = (id, extra = {}) => ({ id, name: 'Place ' + id, priority: 'mandatory', desired_duration_min: 45, address: 'Rome', lat: 41.9, lng: 12.5, ...extra });
const state = (extra = {}) => ({ trip: { id: 'trip', destination: 'Rome', start_date: '2026-10-01', end_date: '2026-10-03', pace: 'balanced', meal_duration_min: 60, buffer_min: 15, transport_preference: 'transit' }, tripItems: [{ id: 'hotel', title: 'Hotel', category: 'stay', address: 'Hotel Rome', lat: 41.9, lng: 12.49 }], dayWindows: [], places: [place('one'), place('two', { priority: 'preferred' })], ...extra });
test('Full itinerary covers every day, selected visits once, hotel routes, meals and non-overlapping blocks', () => {
  const result = scheduleItinerary(state());
  assert.equal(new Set(result.items.map(item => item.date)).size, 3);
  assert.deepEqual(result.items.filter(item => item.step_type === 'visit').map(item => item.selection_id).sort(), ['one','two']);
  assert(result.items.some(item => item.step_type === 'meal'));
  assert(result.items.some(item => item.route_origin === 'Hotel Rome'));
  assert(result.items.some(item => item.route_destination === 'Hotel Rome'));
  for (const date of tripDates(state().trip)) {
    const items = result.items.filter(item => item.date === date);
    for (let i = 1; i < items.length; i++) assert(items[i].start_time >= items[i - 1].end_time, JSON.stringify(items));
  }
  assert.equal(result.conflicts.length, 0);
});
test('Arrival/departure, walking zero, blocks, fixed bookings, exclusions and unscheduled conflicts are respected', () => {
  const data = state();
  Object.assign(data.trip, { travel_type: 'train', arrival_location: 'Roma Termini', arrival_datetime: '2026-10-01T11:00', departure_location: 'Roma Termini', departure_datetime: '2026-10-03T16:00', max_walk_per_day_min: 0, transport_preference: 'walk', exclusions: 'No museums' });
  data.places = [place('fixed', { fixed_date: '2026-10-02', fixed_time: '11:00' }), place('museum', { category: 'museum' }), place('rejected', { priority: 'excluded' }), place('huge', { desired_duration_min: 480, fixed_date: '2026-10-01' })];
  data.dayWindows = [{ date: '2026-10-02', windows: '[{"start":"09:00","end":"18:00"}]', blocked: '[{"start":"13:00","end":"14:00"}]' }];
  const result = scheduleItinerary(data);
  assert(result.items.some(item => item.step_type === 'arrival' && item.title.includes('Roma Termini')));
  assert(result.items.some(item => item.step_type === 'departure'));
  const fixed = result.items.find(item => item.selection_id === 'fixed'); assert(fixed); assert.equal(fixed.date, '2026-10-02'); assert.equal(fixed.start_time, '11:00');
  assert(!result.items.some(item => ['museum','rejected','huge'].includes(item.selection_id)));
  assert(result.conflicts.some(item => item.place === 'Place museum')); assert(result.conflicts.some(item => item.place === 'Place huge'));
  assert(!result.items.some(item => item.route_mode === 'walk'));
  assert(!result.items.filter(item => item.date === '2026-10-02').some(item => item.start_time < '14:00' && item.end_time > '13:00'));
  assert.equal(movement({ transport_preference: 'walk', max_walk_per_day_min: 0 }, { lat: 1, lng: 1 }, { lat: 1.001, lng: 1 }).mode, 'transit');
  for (const [mode, expected] of [['walk', 'walking'], ['taxi', 'driving'], ['car', 'driving'], ['transit', 'transit']]) assert.equal(new URL(buildMapsLink({ origin: 'Hotel & Spa', destination: 'Station', mode })).searchParams.get('travelmode'), expected);
});
test('AI itinerary proposals reject invented IDs, duplicate IDs, missing visits and changed fixed bookings', async t => {
  const old = [config.aiKey, config.aiModel]; config.aiKey = 'fixture'; config.aiModel = 'configured'; t.after(() => { [config.aiKey, config.aiModel] = old; });
  const data = state({ places: [place('fixed', { fixed_date: '2026-10-02', fixed_time: '11:00' })] });
  const good = { selection_id: 'fixed', date: '2026-10-02', preferred_start: '11:00', reason: 'Fixed booking first; verify hours.' };
  const respond = visits => async (_path, body) => {
    assert.equal(body.store, false); assert.equal(body.text.format.name, 'itinerary_route');
    assert(body.instructions.includes('walking limits')); assert.equal(JSON.parse(body.input).selected[0].selection_id, 'fixed');
    return { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ visits }) }] }] };
  };
  assert.equal((await proposeItinerary(data, respond([good]))).generation, 'ai');
  for (const bad of [[], [good, good], [{ ...good, selection_id: 'invented' }], [{ ...good, date: '2026-10-03' }], [{ ...good, preferred_start: '12:00' }]]) assert.equal((await proposeItinerary(data, respond(bad))).generation, 'local');
  assert.equal((await proposeItinerary(data, async () => { throw new Error('private'); })).generation, 'local');
});
test('Referral rules match an exact place, encode placeholders, omit invalid links and do not expose admin configuration', () => {
  const trip = { destination: 'Rome' };
  const item = { step_type: 'visit', ticket_status: 'needed', title: 'Colosseum & Forum', place_id: 'google1', selection_id: 'selection1', date: '2026-10-01' };
  const settings = { allowed_hosts: ['booking.example.com'], admin_secret: 'not-public', rules: [{ place_id: 'google1', url_template: 'https://booking.example.com/product?q={name}&date={date}&affiliate=public-code' }] };
  const link = bookingLink(settings, trip, item);
  assert.equal(new URL(link.url).searchParams.get('q'), item.title);
  assert.deepEqual(Object.keys(link).sort(), ['label', 'url']); assert(!JSON.stringify(link).includes('not-public'));
  assert.equal(bookingLink(settings, trip, { ...item, place_id: 'another' }), null);
  for (const ticket_status of ['free','purchased','unavailable']) assert.equal(bookingLink(settings, trip, { ...item, ticket_status }), null);
  for (const url of ['javascript:alert(1)', 'https://evil.example/book', 'https://secret:password@booking.example.com/', 'https://booking.example.com/{unknown}']) assert.equal(bookingLink({ ...settings, rules: [{ place_id: 'google1', url }] }, trip, item), null);
});
