import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTripMap, groupMapStops, mapCoordinates, mapItemElementId, visibleMapDay } from '../../src/lib/interactive-trip-map.js';

const date = '2026-10-02';
const item = (id, step_type, extra = {}) => ({ id, step_type, date, title: id, start_time: '10:00', ...extra });
const visit = (id, extra = {}) => item(id, 'visit', { location: `${id} address`, lat: 44.4, lng: 26.1, ...extra });
const derive = (items, extra = {}) => buildTripMap({ trip: {}, dates: [date], items, ...extra })[0];
test('Map preserves displayed item order and does not mutate/reorder equal times or sort_order', () => {
  const items = [visit('second', { start_time: '16:00', sort_order: 99 }), visit('first', { start_time: '09:00', sort_order: 0 })];
  const before = JSON.stringify(items), result = derive(items);
  assert.deepEqual(result.stops.map(stop => stop.itemId), ['second', 'first']);
  assert.deepEqual(result.stops.map(stop => stop.number), [1, 2]); assert.equal(JSON.stringify(items), before);
});
test('Saved hotel endpoints surround actual visits and mode-labelled transfers without invented geometry', () => {
  const result = derive([item('out', 'transport', { route_origin: 'Stay address', route_destination: 'Museum address', route_mode: 'walk' }),
    visit('Museum'), item('back', 'transport', { route_origin: 'Museum address', route_destination: 'Stay address', route_mode: 'taxi' })],
  { stays: [{ category: 'stay', title: 'Saved hotel', address: 'Stay address', lat: 44, lng: 26 }] });
  assert.deepEqual(result.stops.map(stop => [stop.name, stop.number]), [['Saved hotel', null], ['Museum', 1], ['Saved hotel', null]]);
  assert.deepEqual(result.entries.map(entry => entry.type), ['stop', 'segment', 'stop', 'segment', 'stop']);
  assert.deepEqual(result.segments.map(segment => segment.mode), ['walk', 'taxi']); assert(!JSON.stringify(result).includes('geometry'));
});
test('No accommodation or return is synthesized; generic meals/buffers never become invented stops', () => {
  const result = derive([visit('A'), item('meal', 'meal', { location: 'A address' }), item('buffer', 'access'), item('free', 'free')],
    { stays: [{ category: 'stay', title: 'Unscheduled hotel', lat: 44, lng: 26 }] });
  assert.equal(result.stops.length, 1); assert.equal(result.segments.length, 0);
});
test('Selected restaurant uses its own coordinates, never its search anchor', () => {
  const restaurant = { name: 'Selected restaurant', lat: 44.45, lng: 26.15, anchor: { lat: 10, lng: 20 } };
  const result = derive([item('lunch', 'meal', { meal_choice: JSON.stringify(restaurant) }), item('missing', 'meal', { meal_choice: JSON.stringify({ name: 'Unknown location', anchor: restaurant.anchor }) })]);
  assert.deepEqual(result.stops[0].position, { lat: 44.45, lng: 26.15 }); assert.equal(result.stops[1].position, null);
});
test('Missing coordinates retain numbering; null/empty/nonfinite/out-of-range values never become 0,0', () => {
  for (const position of [null, {}, { lat: null, lng: null }, { lat: '', lng: '' }, { lat: true, lng: false }, { lat: 91, lng: 26 }, { lat: 44, lng: Infinity }]) assert.equal(mapCoordinates(position), null);
  assert.deepEqual(mapCoordinates({ lat: 0, lng: '0' }), { lat: 0, lng: 0 });
  const result = derive([visit('A'), visit('missing', { lat: null, lng: null }), visit('C')]);
  assert.deepEqual(result.stops.map(stop => stop.number), [1, 2, 3]); assert.equal(result.missing, 1);
});
test('Ambiguous endpoint address and stale selection fail closed', () => {
  const result = derive([item('out', 'transport', { route_origin: 'Shared', route_destination: 'Elsewhere' }), visit('Old', { selection_id: 's', address: 'Old', lat: null, lng: null })],
    { selections: [{ id: 's', address: 'New', lat: 1, lng: 2 }, { address: 'Shared', lat: 3, lng: 4 }, { address: 'Shared', lat: 5, lng: 6 }] });
  assert.equal(result.stops[0].position, null); assert.equal(result.stops.at(-1).position, null);
});
test('Active day changes only when a header crosses the reading threshold', () => {
  assert.equal(visibleMapDay([{ date: 'one', top: -500 }, { date: 'two', top: 241 }], 240, 'fallback'), 'one');
  assert.equal(visibleMapDay([{ date: 'one', top: -500 }, { date: 'two', top: 240 }], 240, 'fallback'), 'two');
  assert.equal(visibleMapDay([], 240, 'fallback'), 'fallback');
});
test('All mode groups coincident locations without moving coordinates; Day retains every stop', () => {
  const stops = derive([visit('A'), visit('B'), visit('C', { lng: 27 })]).stops;
  assert.equal(groupMapStops(stops, true).length, 2);
  assert.deepEqual(groupMapStops(stops, true)[0].map(stop => stop.itemId), ['A', 'B']);
  assert.equal(groupMapStops(stops, false).length, 3);
});
test('Twelve days, many stops, repeated locations, long names and calendar dates remain independent', () => {
  const dates = Array.from({ length: 12 }, (_, index) => `2026-11-${String(index + 1).padStart(2, '0')}`);
  const days = buildTripMap({ trip: { timezone: 'Pacific/Honolulu' }, dates, items: dates.flatMap(date => Array.from({ length: 25 }, (_, i) => visit(`${date}-${i}`, { date, title: 'Long location '.repeat(15) }))) });
  assert.equal(days.length, 12); assert(days.every(day => day.stops.length === 25 && day.stops[24].number === 25));
  assert.equal(days[0].date, '2026-11-01'); assert.equal(days[11].dayIndex, 11);
  assert.equal(mapItemElementId(days[0].stops[0].itemId), 'map-itinerary-2026-11-01-0');
});
