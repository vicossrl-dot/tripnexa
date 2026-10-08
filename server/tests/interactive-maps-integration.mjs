import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFixture } from './interactive-maps-fixture.mjs';
import { buildTripMap } from '../../src/lib/interactive-trip-map.js';

test('Interactive maps reuse owned itinerary data and existing durable premium entitlements', { skip: !process.env.MYSQL_TEST_DATABASE }, async t => {
  const fixture = await mapFixture(); t.after(() => fixture.close());
  const { call, paid, free, pool, setting } = fixture, path = id => `/trips/${id}/interactive-map`;
  await t.test('Anonymous and cross-owner map configuration are denied', async () => {
    assert.equal((await call(path(paid.trip.id))).status, 401);
    assert.equal((await call(path(paid.trip.id), free.cookie)).status, 404);
  });
  await t.test('Free trip has the normal paywall while itinerary and Google route data remain available', async () => {
    const denied = await call(path(free.trip.id), free.cookie); assert.equal(denied.status, 402); assert.equal(denied.data.code, 'PREMIUM_FEATURE_REQUIRED');
    assert.equal(denied.data.tripId, free.trip.id); assert.equal(denied.data.allowTripPack, true);
    const plan = await call(`/trips/${free.trip.id}/itinerary`, free.cookie); assert.equal(plan.status, 200); assert(plan.data.items.some(item => item.route_origin));
  });
  await t.test('Paid trip on a Free account retains access and never consumes another credit', async () => {
    assert.equal((await call('/billing/status', paid.cookie)).data.plan, 'FREE');
    const before = (await call('/billing/status', paid.cookie)).data;
    const response = await call(path(paid.trip.id), paid.cookie); assert.equal(response.status, 200); assert.equal(response.data.browserKey, 'browser-fixture-not-a-key');
    assert.deepEqual(Object.keys(response.data).sort(), ['browserKey', 'configured', 'provider']);
    assert.deepEqual((await call('/billing/status', paid.cookie)).data, before);
  });
  await t.test('Actual API item order, dates and edit are preserved by the map projection', async () => {
    const plan = (await call(`/trips/${paid.trip.id}/itinerary`, paid.cookie)).data;
    const model = buildTripMap({ trip: paid.trip, items: plan.items, dates: plan.dates, stays: paid.stays });
    assert.equal(model.length, 12); assert.equal(model[1].stops.length, 1); assert.equal(model[2].missing, 3); assert.equal(model[3].visits, 18);
    for (const day of model) assert.deepEqual(day.stops.filter(stop => stop.kind === 'visit').map(stop => stop.itemId), plan.items.filter(item => item.date === day.date && item.step_type === 'visit').map(item => item.id));
    const target = plan.items.find(item => item.step_type === 'visit');
    const changed = await call(`/entities/ItineraryItem/${target.id}`, paid.cookie, { start_time: '08:00' }, 'PATCH'); assert.equal(changed.status, 200);
    const next = (await call(`/trips/${paid.trip.id}/itinerary`, paid.cookie)).data;
    const updated = buildTripMap({ trip: paid.trip, items: next.items, dates: next.dates, stays: paid.stays });
    assert.equal(updated[0].stops[0].itemId, target.id); assert.equal(updated[0].stops[0].time, '08:00');
  });
  await t.test('Disabled provider has a safe response without leaking the server key', async () => {
    delete process.env.GOOGLE_MAPS_BROWSER_KEY;
    assert.deepEqual((await call(path(paid.trip.id), paid.cookie)).data, { provider: 'google', configured: false, browserKey: '' });
    process.env.GOOGLE_MAPS_BROWSER_KEY = 'browser-fixture-not-a-key';
  });
  await t.test('Expired grant is denied and existing billing enforcement pause is respected', async () => {
    await pool.execute('UPDATE billing_trip_entitlements SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 DAY WHERE trip_id=?', [paid.trip.id]);
    assert.equal((await call(path(paid.trip.id), paid.cookie)).status, 402);
    await setting('billing_enforcement_enabled', false);
    assert.equal((await call(path(free.trip.id), free.cookie)).status, 200);
    assert.equal((await call(path(free.trip.id), paid.cookie)).status, 404);
  });
  await t.test('Existing Google provider disable switch suppresses browser configuration', async () => {
    await setting('google_enabled', false);
    assert.deepEqual((await call(path(paid.trip.id), paid.cookie)).data, { provider: 'google', configured: false, browserKey: '' });
  });
});
