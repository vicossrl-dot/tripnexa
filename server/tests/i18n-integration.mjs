import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

test('MySQL: additive locale migration, preference persistence and account isolation', { skip: !process.env.MYSQL_TEST_DATABASE }, async t => {
  assert.match(process.env.MYSQL_TEST_DATABASE, /_test$/);
  assert(['127.0.0.1', 'localhost'].includes(process.env.MYSQL_HOST || '127.0.0.1'), 'Locale regression test uses a loopback-only test database.');
  process.env.MYSQL_DATABASE = process.env.MYSQL_TEST_DATABASE;
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = '';
  const { pool } = await import('../db.js');
  const { migrate } = await import('../migrate.js');
  const { hashPassword } = await import('../security.js');
  const { createApp } = await import('../app.js');
  const { config } = await import('../config.js');
  const users = [randomUUID(), randomUUID()];
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    for (const id of users) await pool.execute('DELETE FROM users WHERE id=?', [id]);
    await pool.end();
  });
  await migrate(); await migrate();
  const [columns] = await pool.query("SHOW COLUMNS FROM users LIKE 'ui_locale'");
  assert.equal(columns[0].Type, 'varchar(5)'); assert.equal(columns[0].Null, 'YES'); assert.equal(columns[0].Default, null);
  const password = 'locale fixture password ' + randomUUID();
  for (const id of users) await pool.execute('INSERT INTO users (id,email,password_hash,email_verified) VALUES (?,?,?,TRUE)', [id, `${id}@locale.example.test`, await hashPassword(password)]);
  server = createApp().listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  config.appUrl = origin;
  const request = async (url, method = 'GET', body, cookie,locale) => {
    const response = await fetch(origin + '/api' + url, { method, headers: { 'X-Requested-With': 'TripSync', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}),...(locale?{'X-TripNexa-Locale':locale}:{}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const first = await request('/auth/login', 'POST', { email: `${users[0]}@locale.example.test`, password });
  const second = await request('/auth/login', 'POST', { email: `${users[1]}@locale.example.test`, password });
  assert.equal(first.status, 200); assert.equal(second.status, 200);
  assert.equal((await request('/auth/me', 'PATCH', { ui_locale: 'ro' })).status, 401);
  for (const ui_locale of ['en', 'ro', 'ru', 'de', 'fr', 'es']) {
    const saved = await request('/auth/me', 'PATCH', { ui_locale }, first.cookie);
    assert.equal(saved.status, 200); assert.equal(saved.data.ui_locale, ui_locale);
    assert.equal((await request('/auth/me', 'GET', undefined, first.cookie)).data.ui_locale, ui_locale);
    assert.equal((await request('/auth/me', 'GET', undefined, second.cookie)).data.ui_locale, null);
    assert.equal(saved.data.password_hash, undefined);
    // A fresh session represents another device with no local preference state.
    const device=await request('/auth/login','POST',{email:`${users[0]}@locale.example.test`,password});
    assert.equal(device.status,200);assert.equal(device.data.ui_locale,ui_locale);
    assert.equal((await request('/auth/me','GET',undefined,device.cookie)).data.ui_locale,ui_locale);
    await request('/auth/logout','POST',{},device.cookie);
    assert.equal((await request('/auth/me','GET',undefined,device.cookie)).status,401);
  }
  assert.equal((await request('/auth/me', 'PATCH', { ui_locale: 'it' }, first.cookie)).status, 400);
  assert.equal((await request('/auth/me', 'PATCH', { ui_locale: 'ro', role: 'SUPER_ADMIN' }, first.cookie)).status, 400);
  const updated = await request('/auth/me', 'PATCH', { display_name: 'Locale fixture', ui_locale: 'de' }, first.cookie);
  assert.equal(updated.data.display_name, 'Locale fixture');
  await request('/auth/logout', 'POST', {}, first.cookie);
  const login = await request('/auth/login', 'POST', { email: `${users[0]}@locale.example.test`, password });
  assert.equal((await request('/auth/me', 'GET', undefined, login.cookie)).data.ui_locale, 'de');
  const {serverMessage}=await import('../i18n.js');
  const german=await request('/auth/me','PATCH',{ui_locale:'unsupported'},login.cookie);
  assert.equal(german.status,400);assert.equal(german.data.error,serverMessage('Invalid ui_locale.','de'));
  const russian=await request('/auth/me','PATCH',{ui_locale:'unsupported'},login.cookie,'ru');
  assert.equal(russian.status,400);assert.equal(russian.data.error,serverMessage('Invalid ui_locale.','ru'));
  const trip=randomUUID(),item=randomUUID();
  await pool.execute('INSERT INTO trips(id,owner_id,name,start_date,end_date) VALUES(?,?,?,?,?)',[trip,users[0],'Canonical fixture','2026-10-08','2026-10-08']);
  await pool.execute('INSERT INTO itinerary_items(id,owner_id,trip_id,step_type,title,date) VALUES(?,?,?,?,?,?)',[item,users[0],trip,'meal','Meal','2026-10-08']);
  for(const locale of ['ro','ru','de','fr','es']){
    const translated=await request(`/trips/${trip}/localized-content`,'POST',{},login.cookie,locale);
    assert.equal(translated.status,200);assert.equal(translated.data.translations.Meal,serverMessage('Meal',locale));
    const [[source]]=await pool.execute('SELECT title,step_type FROM itinerary_items WHERE id=?',[item]);assert.equal(source.title,'Meal');assert.equal(source.step_type,'meal');
    const invalid=await request(`/entities/ItineraryItem/${item}`,'PATCH',{step_type:serverMessage('Meal',locale)},login.cookie,locale);
    assert.equal(invalid.status,400,'A localized label cannot become a schema enum.');
  }
  assert.equal((await request(`/trips/${trip}/localized-content`,'POST',{},second.cookie,'ru')).status,404);
  const [[operations]]=await pool.execute('SELECT COUNT(*) AS count FROM billing_operations WHERE trip_id=?',[trip]);assert.equal(operations.count,0,'Static display translations must not generate paid model calls.');
});
