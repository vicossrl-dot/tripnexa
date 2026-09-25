import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, normalizeEmail, sessionToken, secretToken } from '../security.js';
import { validateData, serialize } from '../schema.js';
import { querySpec, owned } from '../entities.js';
import { publicProjection } from '../trips.js';
import { imageType } from '../uploads.js';
import { strictSchema } from '../ai.js';
import { pool } from '../db.js';
import { safeReturnTo } from '../../src/lib/authReturnTo.js';

test('login redirects stay on local paths after URL normalization', () => {
  const original = globalThis.window;
  try {
    for (const [target, expected] of [
      ['/trip/123?tab=plan', '/trip/123?tab=plan'],
      ['https://example.com', '/'], ['//example.com', '/'],
      ['/.//example.com', '/'], ['/a/..//example.com', '/'],
      ['/\\example.com', '/'],
    ]) {
      globalThis.window = { location: { origin: 'http://localhost:5173', search: '?returnTo=' + encodeURIComponent(target) } };
      assert.equal(safeReturnTo(), expected);
    }
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

test.after(() => pool.end());
test('passwords are salted, verified, and never stored as plaintext', async () => {
  const password = 'a long test password 123';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert(!first.includes(password));
  assert(await verifyPassword(password, first));
  assert.equal(await verifyPassword('wrong password', first), false);
  assert.equal(await verifyPassword(password, null), false);
  await assert.rejects(() => hashPassword('short'), /12 and 128/);
});
test('emails and opaque session cookies are validated', () => {
  assert.equal(normalizeEmail(' USER@Example.com '), 'user@example.com');
  assert.throws(() => normalizeEmail('invalid'), /email/);
  const token = secretToken();
  assert.equal(sessionToken({ headers: { cookie: `other=x; tripsync_session=${token}` } }), token);
  assert.equal(sessionToken({ headers: { cookie: 'tripsync_session=bad' } }), null);
  assert.notEqual(secretToken(), secretToken());
});
test('entity validation excludes ownership and credential injection', () => {
  const data = validateData('Trip', { name: 'Rome', owner_id: 'someone-else', created_by_id: 'someone-else', share_token: 'chosen-by-client' });
  assert.deepEqual(data, { name: 'Rome' });
  assert.throws(() => validateData('User', { role: 'admin' }, true), /Unknown field/);
  assert.throws(() => validateData('Trip', { name: 'Rome', start_date: '2026-02-31' }), /date/);
  assert.throws(() => validateData('TripItem', { title: 'X', category: 'invalid' }), /category/);
  assert.throws(() => validateData('Trip', { name: 'Rome', cover_image_url: 'javascript:alert(1)' }), /URL/);
  assert.throws(() => validateData('Trip', { name: 'Rome', cover_image_url: 'https://media.base44.com/file.png' }), /local storage/);
  assert.throws(() => validateData('Trip', { name: 'Rome', adults: {} }), /number/);
  assert.deepEqual(validateData('User', { display_name: 'A' }), { display_name: 'A' });
});
test('queries always contain owner scope and reject injected fields and SQL', () => {
  const query = querySpec('TripItem', { filter: JSON.stringify({ trip_id: 'trip-1' }), sort: '-date', limit: '50' }, 'owner-1');
  assert.equal(query.where, 'owner_id=? AND `trip_id`=?');
  assert.deepEqual(query.values, ['owner-1','trip-1']);
  assert.throws(() => querySpec('Trip', { sort: 'id; DROP TABLE users' }, 'u'), /sort/);
  assert.throws(() => querySpec('Trip', { filter: '{"owner_id":"other"}' }, 'u'), /filter/);
  assert.throws(() => querySpec('Trip', { filter: '{"name":{"$ne":null}}' }, 'u'), /filter/);
  assert.throws(() => querySpec('Trip', { limit: '1 UNION SELECT 1' }, 'u'), /Limit/);
});
test('record ownership is enforced by the database query', async () => {
  const db = { execute: async (sql, params) => {
    assert(sql.includes('WHERE id=? AND owner_id=?'));
    assert.deepEqual(params, ['trip-1','wrong-owner']);
    return [[]];
  } };
  await assert.rejects(() => owned(db, 'Trip', 'trip-1', 'wrong-owner'), error => error.status === 404);
});
test('public trips omit private notes, URLs and accommodation routes', () => {
  const trip = { name: 'Rome', share_hide_stay: true, owner_id: 'private', share_token: 'private' };
  const items = [
    { id: 'a', step_type: 'transport', title: 'Hotel Secret to Museum', route_origin: 'Hotel Secret', route_destination: 'Hotel Secret', location: 'Hotel Secret', notes: 'secret code', source_url: 'ticket secret' },
    { id: 'b', step_type: 'access', title: 'Hotel entrance' },
    { id: 'c', step_type: 'visit', title: 'Museum', location: 'Museum Street' },
  ];
  const result = publicProjection(trip, items);
  const json = JSON.stringify(result);
  assert.equal(result.items.length, 2);
  assert(!json.includes('Secret') && !json.includes('secret') && !json.includes('private'));
  assert.equal(result.items[1].location, 'Museum Street');
});
test('profile serialization never returns password hashes', () => {
  const user = serialize('User', { id: 'u', password_hash: 'secret', email_verified: 1, display_name: 'Alice' });
  assert.equal(user.password_hash, undefined);
  assert.equal(user.email_verified, undefined);
  assert.equal(user.role, 'USER');
});
test('uploads require recognized binary signatures; executable SVG/HTML is rejected', () => {
  assert.equal(imageType(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  assert.equal(imageType(Buffer.from('<html>hello</html>')), null);
  assert.deepEqual(imageType(Buffer.from([137,80,78,71,13,10,26,10])), ['png','image/png']);
});
test('AI schemas cannot introduce references or arbitrary keys', () => {
  const result = strictSchema({ type: 'object', properties: { name: { type: 'string' } } });
  assert.deepEqual(result.required, ['name']);
  assert.equal(result.additionalProperties, false);
  assert.throws(() => strictSchema({ $ref: 'file:///etc/passwd' }), /schema/);
});
