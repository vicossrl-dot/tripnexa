import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../app.js';
import { pool } from '../db.js';

test('HTTP routes protect private data, reject CSRF and report readiness', async t => {
  const query=t.mock.method(pool,'query',async()=>[[]]);
  t.mock.method(pool,'execute',async()=>[[]]);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await pool.end(); });
  const privateData = await fetch(`${origin}/api/entities/Trip`);
  assert.equal(privateData.status, 401);
  const csrf = await fetch(`${origin}/api/auth/logout`, { method: 'POST' });
  assert.equal(csrf.status, 403);
  const crossOrigin = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { 'X-Requested-With': 'TripSync', Origin: 'https://untrusted.example' } });
  assert.equal(crossOrigin.status, 403);
  const logout = await fetch(`${origin}/api/auth/logout`, { method: 'POST', headers: { 'X-Requested-With': 'TripSync' } });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /HttpOnly/);
  for(const provider of ['constructor','toString','__proto__'])assert.equal((await fetch(`${origin}/api/auth/${provider}/start`,{method:'POST',headers:{'X-Requested-With':'TripSync','Content-Type':'application/json'},body:'{}'})).status,404);
  const invalidShare = await fetch(`${origin}/api/shared/short`);
  assert.equal(invalidShare.status, 404);
  const settings = await fetch(`${origin}/api/config`).then(r => r.json());
  assert.deepEqual(Object.keys(settings).sort(), ['ai','features','imageGeneration','places']);
  assert.equal(settings.features.registration,true);
  for (const route of ['/places/autocomplete', '/places/details', '/ai/trip-names', '/ai/planning-suggestions']) {
    const response = await fetch(origin + '/api' + route, { method: 'POST', headers: { 'X-Requested-With': 'TripSync', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401, route);
  }
  const mock = query;
  mock.mock.mockImplementation(async()=>[[{ready:1}]]);
  assert.equal((await fetch(`${origin}/api/health`)).status, 200);
  mock.mock.mockImplementation(async () => { throw new Error('private database credentials'); });
  const unavailable = await fetch(`${origin}/api/health`);
  assert.equal(unavailable.status, 503);
  assert(!(await unavailable.text()).includes('credentials'));
});
