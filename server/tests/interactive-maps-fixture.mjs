// Isolated MySQL fixtures shared by HTTP and browser tests. No live API calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

export async function mapFixture() {
  assert.match(process.env.MYSQL_TEST_DATABASE || '', /_test$/);
  process.env.MYSQL_DATABASE = process.env.MYSQL_TEST_DATABASE;
  process.env.NODE_ENV = 'test'; process.env.SMTP_HOST = '';
  const { pool, transaction } = await import('../db.js'), { migrate } = await import('../migrate.js');
  const { createApp } = await import('../app.js'), { hashPassword } = await import('../security.js'), { insertRecord } = await import('../entities.js');
  await migrate();
  const keys = ['billing_enforcement_enabled', 'billing_mode', 'google_enabled'];
  const [settings] = await pool.query('SELECT * FROM app_settings WHERE setting_key IN (?,?,?)', keys);
  const setting = async (key, value) => pool.execute('INSERT INTO app_settings(setting_key,value,version)VALUES(?,?,1) ON DUPLICATE KEY UPDATE value=VALUES(value),version=version+1', [key, JSON.stringify(value)]);
  await setting(keys[0], true); await setting(keys[1], 'test'); await setting(keys[2], true);
  const previousKey = process.env.GOOGLE_MAPS_BROWSER_KEY;
  process.env.GOOGLE_MAPS_BROWSER_KEY = 'browser-fixture-not-a-key';
  const server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`; process.env.PUBLIC_APP_URL = origin;
  const users = [], password = 'Interactive map local fixture 123!';
  const call = async (path, cookie = '', body = undefined, method = body ? 'POST' : 'GET') => {
    const response = await fetch(origin + '/api' + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-Requested-With': 'TripSync' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  async function create(premium, count) {
    const id = randomUUID(), email = `${id}@interactive-map.test`; users.push(id);
    await pool.execute('INSERT INTO users(id,email,password_hash,email_verified)VALUES(?,?,?,TRUE)', [id, email, await hashPassword(password)]);
    const dates = Array.from({ length: count }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const trip = await transaction(db => insertRecord(db, 'Trip', { name: 'Bucharest · map review', destination: 'Bucharest', country: 'Romania', timezone: 'Europe/Bucharest', start_date: dates[0], end_date: dates.at(-1) }, id));
    if (premium) await pool.execute("UPDATE billing_trip_entitlements SET source='TRIP_PACK',mode='test' WHERE trip_id=?", [trip.id]);
    const stays = [], items = [];
    const save = (name, value) => transaction(db => insertRecord(db, name, value, id, { internal: true }));
    stays.push(await save('TripItem', { trip_id: trip.id, category: 'stay', title: 'Review accommodation', address: 'Saved stay address', date: dates[0], end_date: dates[0], lat: 44.435, lng: 26.095 }));
    for (const [d, date] of dates.entries()) {
      let order = 0;
      const add = async (type, title, time, extra = {}) => items.push(await save('ItineraryItem', { trip_id: trip.id, date, sort_order: order++, step_type: type, title, start_time: time, end_time: time, ...extra }));
      if (d === 0) await add('transport', 'Stay to museum', '09:00', { route_origin: 'Saved stay address', route_destination: 'Museum address', route_mode: 'transit', duration_min: 30 });
      const visits = d === 1 ? 1 : d === 3 ? 18 : 3;
      for (let i = 0; i < visits; i++) {
        const title = i === 0 ? 'Museum' : d === 3 ? `Long saved place name ${i} · ${'neighborhood and garden '.repeat(6)}` : `Saved place ${i + 1}`;
        await add('visit', title, `${String(10 + Math.floor(i / 3)).padStart(2, '0')}:${String(i % 3 * 20).padStart(2, '0')}`, { location: i === 0 ? 'Museum address' : `Saved address ${i}`, duration_min: 60, ticket_status: 'free', ...(d !== 2 ? { lat: 44.425 + i * 0.004, lng: 26.086 + i * 0.004 } : {}) });
      }
      if (d === 0) {
        await add('meal', 'Lunch break', '13:00', { duration_min: 60, meal_choice: JSON.stringify({ name: 'Selected restaurant', address: 'Restaurant address', lat: 44.442, lng: 26.102 }) });
        await add('transport', 'Walk', '14:00', { route_origin: 'Restaurant address', route_destination: 'Garden address', route_mode: 'walk', duration_min: 15 });
        await add('visit', 'Garden', '14:30', { location: 'Garden address', lat: 44.438, lng: 26.108, duration_min: 90, ticket_status: 'free' });
        await add('transport', 'Return to stay', '16:00', { route_origin: 'Garden address', route_destination: 'Saved stay address', route_mode: 'taxi', duration_min: 20 });
      }
    }
    const login = await call('/auth/login', '', { email, password }); assert.equal(login.status, 200);
    return { id, email, password, trip, dates, items, stays, cookie: login.cookie };
  }
  const paid = await create(true, 12), free = await create(false, 1), paidSingle = await create(true, 1);
  return { pool, call, origin, paid, free, paidSingle, setting,
    async close() {
      await new Promise(resolve => server.close(resolve));
      for (const id of users) await pool.execute('DELETE FROM users WHERE id=?', [id]);
      await pool.query('DELETE FROM app_settings WHERE setting_key IN (?,?,?)', keys);
      for (const row of settings) await pool.query('INSERT INTO app_settings SET ?', { ...row, value: typeof row.value === 'object' ? JSON.stringify(row.value) : row.value });
      if (previousKey === undefined) delete process.env.GOOGLE_MAPS_BROWSER_KEY; else process.env.GOOGLE_MAPS_BROWSER_KEY = previousKey;
      await pool.end();
    },
  };
}
