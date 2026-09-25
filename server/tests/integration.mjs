import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

test('MySQL: login, ownership, planning, sharing, uploads and cascading deletes', { skip: !process.env.MYSQL_TEST_DATABASE ? 'Set MYSQL_TEST_DATABASE to a separate database ending in _test.' : false }, async t => {
  assert.match(process.env.MYSQL_TEST_DATABASE, /_test$/);
  process.env.MYSQL_DATABASE = process.env.MYSQL_TEST_DATABASE;
  process.env.SMTP_HOST = '';
  process.env.NODE_ENV = 'test';
  process.env.MAIL_OUTBOX = '.local/integration-mail';
  const { pool } = await import('../db.js');
  const { migrate } = await import('../migrate.js');
  const { hashPassword } = await import('../security.js');
  const { createApp } = await import('../app.js');
  const {config:providerConfig}=await import('../config.js');providerConfig.googleMapsKey='';
  await migrate();
  await migrate(); // Re-running the additive upgrade must be harmless.
  const ids = [randomUUID(), randomUUID()];
  const emails = ids.map(id => `${id}@example.test`);
  const password = 'integration password 12345';
  for (let i=0;i<2;i++) await pool.execute('INSERT INTO users (id,email,password_hash,email_verified) VALUES (?,?,?,TRUE)', [ids[i], emails[i], await hashPassword(password)]);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}/api`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    for (const id of ids) await pool.execute('DELETE FROM users WHERE id=?', [id]);
    await pool.end();
  });
  const call = async (url, method = 'GET', body, cookie) => {
    const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TripSync', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const first = await call('/auth/login', 'POST', { email: emails[0], password });
  const second = await call('/auth/login', 'POST', { email: emails[1], password });
  assert.equal(first.status, 200); assert(first.cookie);
  const trip = await call('/entities/Trip', 'POST', { name: 'Test', destination: 'Rome', start_date: '2026-10-01', end_date: '2026-10-02', travel_type: 'train', destination_city: 'Rome', destination_formatted_address: 'Rome, Italy', destination_place_id: 'a'.repeat(120), destination_latitude: 41.9, destination_longitude: 12.5, country: 'Italy', timezone: 'Europe/Rome' }, first.cookie);
  assert.equal(trip.status, 201);
  const id = trip.data.id;
  const persisted = await call(`/entities/Trip/${id}`, 'GET', undefined, first.cookie);
  for (const field of ['travel_type','destination_city','destination_formatted_address','destination_place_id','destination_latitude','destination_longitude','country','timezone']) assert.equal(persisted.data[field], trip.data[field], field);
  assert.equal((await call(`/entities/Trip/${id}`, 'GET', undefined, second.cookie)).status, 404);
  assert.equal((await call(`/entities/Trip/${id}`, 'PATCH', { name: 'intrusion' }, second.cookie)).status, 404);
  assert.equal((await call('/ai/planning-suggestions', 'POST', { trip_id: id }, second.cookie)).status, 404);
  assert.deepEqual((await call('/entities/Trip', 'GET', undefined, second.cookie)).data, []);
  assert.equal((await call('/entities/TripItem', 'POST', { trip_id: id, title: 'bad', category: 'stay' }, second.cookie)).status, 404);
  const day = { id: randomUUID(), trip_id: id, date: '2026-10-01', windows: '[{"start":"09:00","end":"18:00"}]', blocked: '[]' };
  assert.equal((await call(`/trips/${id}/planning/windows`, 'PUT', { items: [day] }, first.cookie)).status, 200);
  const place = { id: randomUUID(), trip_id: id, name: 'Museum', address: 'Rome', priority: 'mandatory', desired_duration_min: 60, ticket_type: 'none', city: 'Rome', country: 'Italy', place_id: 'g'.repeat(120), lat: 41.9, lng: 12.5, category: 'museum', selection_source: 'google' };
  assert.equal((await call(`/trips/${id}/planning/places`, 'PUT', { items: [place] }, first.cookie)).status, 200);
  const savedPlaces = await call('/entities/PlaceSelection?filter=' + encodeURIComponent(JSON.stringify({ trip_id: id })), 'GET', undefined, first.cookie);
  for (const field of ['city','country','place_id','lat','lng','category','selection_source']) assert.equal(savedPlaces.data[0][field], place[field]);
  await t.test('Planning AI reads owned saved context; accept, edit and reject persist', async t => {
    const { config } = await import('../config.js');
    const previous = [config.aiKey, config.aiModel]; config.aiKey = 'fixture-ai'; config.aiModel = 'fixture-model';
    t.after(() => { [config.aiKey, config.aiModel] = previous; });
    await call(`/entities/Trip/${id}`, 'PATCH', { exclusions: 'No museums', mobility_needs: 'Step-free', max_walk_per_day_min: 0 }, first.cookie);
    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
      const body = JSON.parse(options.body), context = JSON.parse(body.input);
      assert.equal(context.trip.mobility_needs, 'Step-free'); assert.equal(context.trip.max_walk_per_day_min, 0);
      assert.equal(context.places[0].place_id, place.place_id);
      const suggested = { name: 'Garden', aliases: [], fit_reason: 'Compact outdoor garden near your stay.', category: 'nature', area: 'Centro', address: 'Rome', visit_duration_min: 30, best_time_of_day: 'morning', indoor_outdoor: 'outdoor' };
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ suggestions: [suggested] }) }] }] }), { headers: { 'Content-Type': 'application/json' } });
    });
    const response = await call('/ai/planning-suggestions', 'POST', { trip_id: id, prompt: 'Ignored', places: [] }, first.cookie);
    assert.equal(response.status, 200); assert.equal(response.data.suggestions[0].name, 'Garden');
    const accepted = { id: randomUUID(), trip_id: id, name: 'Garden', priority: 'preferred', selection_source: 'ai', desired_duration_min: 30, fit_reason: 'Nearby', area: 'Centro', best_time_of_day: 'morning' };
    assert.equal((await call(`/trips/${id}/planning/places`, 'PUT', { items: [place, accepted] }, first.cookie)).status, 200);
    const duplicate = await call('/ai/planning-suggestions', 'POST', { trip_id: id }, first.cookie);
    assert.deepEqual(duplicate.data.suggestions, []);
    assert.equal((await call(`/entities/PlaceSelection/${accepted.id}`, 'PATCH', { desired_duration_min: 45, priority: 'excluded' }, first.cookie)).status, 200);
    const rejected = await call(`/entities/PlaceSelection/${accepted.id}`, 'GET', undefined, first.cookie);
    assert.equal(rejected.data.priority, 'excluded'); assert.equal(rejected.data.desired_duration_min, 45); assert.equal(rejected.data.fit_reason, 'Nearby');
    assert.deepEqual((await call('/ai/planning-suggestions', 'POST', { trip_id: id }, first.cookie)).data.suggestions, []);
  });
  const built = await call(`/trips/${id}/itinerary`, 'POST', undefined, first.cookie);
  assert.equal(built.status, 200); assert(built.data.items.length > 0);
  const shared = await call(`/trips/${id}/share`, 'POST', { enabled: true, hideStay: true }, first.cookie);
  assert.equal(shared.status, 200);
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlT8AAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
  const upload = await fetch(origin + '/uploads', { method: 'POST', headers: { 'X-Requested-With': 'TripSync', Cookie: first.cookie }, body: form });
  assert.equal(upload.status, 201);
  const { file_url } = await upload.json();
  await t.test('Private tickets persist, reject another owner, and remain absent from public sharing', async () => {
    const pdf = new FormData(); pdf.append('file', new Blob(['%PDF-1.4\n%%EOF'], { type: 'application/pdf' }), 'ticket.pdf');
    const uploaded = await fetch(origin + '/uploads/document', { method: 'POST', headers: { 'X-Requested-With': 'TripSync', Cookie: first.cookie }, body: pdf });
    assert.equal(uploaded.status, 201);
    const ticket = (await uploaded.json()).file_url;
    assert.equal((await call(`/entities/Trip/${id}`, 'PATCH', { arrival_ticket_url: ticket, arrival_location: 'Airport', arrival_place_id: 'g'.repeat(120), arrival_lat: 41.3, arrival_lng: 2.1 }, first.cookie)).status, 200);
    assert.equal((await call(`/entities/Trip/${id}`, 'GET', undefined, first.cookie)).data.arrival_ticket_url, ticket);
    const secondTrip = await call('/entities/Trip', 'POST', {name:'Other'}, second.cookie);
    assert.equal((await call(`/entities/Trip/${secondTrip.data.id}`, 'PATCH', { arrival_ticket_url: ticket }, second.cookie)).status,404);
    assert.equal((await call(`/trips/${secondTrip.data.id}/planning/stays`, 'PUT', {items:[{id:randomUUID(),title:'Hotel',reservation_file_url:ticket}]}, second.cookie)).status,404);
    assert.equal((await call('/ai/stay-extraction','POST',{trip_id:id,file_url:ticket},second.cookie)).status,404);
    const url=origin.replace(/\/api$/, '') + ticket;
    assert.equal((await fetch(url)).status,401);
    assert.equal((await fetch(url,{headers:{Cookie:second.cookie}})).status,404);
    const downloaded=await fetch(url,{headers:{Cookie:first.cookie}});
    assert.equal(downloaded.status,200);assert.match(downloaded.headers.get('content-disposition'),/attachment/);
    const publicData=(await call(`/shared/${shared.data.share_token}`)).data;
    assert(!JSON.stringify(publicData).includes(ticket));
  });
  assert.equal((await fetch(origin.replace(/\/api$/, '') + file_url, { headers: { Cookie: second.cookie } })).status, 404);
  assert.equal((await fetch(origin.replace(/\/api$/, '') + file_url, { headers: { Cookie: first.cookie } })).status, 200);
  assert.equal((await call(`/shared/${shared.data.share_token}`)).status, 200);
  await call(`/trips/${id}/share`, 'POST', { enabled: false, hideStay: true }, first.cookie);
  assert.equal((await call(`/shared/${shared.data.share_token}`)).status, 404);
  assert.equal((await call(`/entities/Trip/${id}`, 'DELETE', undefined, first.cookie)).status, 200);
  const [remaining] = await pool.execute('SELECT COUNT(*) AS n FROM itinerary_items WHERE trip_id=?', [id]);
  assert.equal(remaining[0].n, 0);
  await call('/auth/logout', 'POST', undefined, first.cookie);
  assert.equal((await call('/auth/me', 'GET', undefined, first.cookie)).status, 401);
  const { readdir, readFile } = await import('node:fs/promises');
  const { config } = await import('../config.js');
  const registrationEmail = randomUUID() + '@example.test';
  assert.equal((await call('/auth/register', 'POST', { email: registrationEmail, password })).status, 201);
  const [registered] = await pool.execute('SELECT id FROM users WHERE email=?', [registrationEmail]);
  ids.push(registered[0].id);
  const messages = await Promise.all((await readdir(config.outbox)).map(file => readFile(config.outbox + '/' + file, 'utf8')));
  const message = messages.find(text => text.includes(registrationEmail) && text.includes('verification code'));
  const otpCode = message.match(/verification code: (\d{6})/)[1];
  const verified = await call('/auth/verify', 'POST', { email: registrationEmail, otpCode });
  assert.equal(verified.status, 200);
  assert.equal((await call('/auth/verify', 'POST', { email: registrationEmail, otpCode })).status, 400);
  assert.equal((await call('/auth/forgot-password', 'POST', { email: registrationEmail })).status, 200);
  const resetMessages = await Promise.all((await readdir(config.outbox)).map(file => readFile(config.outbox + '/' + file, 'utf8')));
  const reset = resetMessages.find(text => text.includes(registrationEmail) && text.includes('/reset-password?'));
  const resetUrl = new URL(reset.match(/https?:\/\/[^\s]+/)[0]);
  const payload = { userId: resetUrl.searchParams.get('user'), resetToken: resetUrl.searchParams.get('token'), newPassword: 'a different test password 789' };
  assert.equal((await call('/auth/reset-password', 'POST', payload)).status, 200);
  assert.equal((await call('/auth/me', 'GET', undefined, verified.cookie)).status, 401);
  assert.equal((await call('/auth/reset-password', 'POST', payload)).status, 400);
  assert.equal((await call('/auth/login', 'POST', { email: registrationEmail, password: payload.newPassword })).status, 200);

  await t.test('Itineraries persist, edit only affected days, protect ownership and reject stale generation', async t => {
    first.cookie = (await call('/auth/login', 'POST', { email: emails[0], password })).cookie;
    const { config } = await import('../config.js');
    const { writeFile, unlink } = await import('node:fs/promises');
    const oldFile = config.referralFile;
    config.referralFile = '.local/referrals-test-' + randomUUID() + '.json';
    const temporaryFile = config.referralFile;
    t.after(async () => { config.referralFile = oldFile; await unlink(temporaryFile); });
    await writeFile(temporaryFile, JSON.stringify({ allowed_hosts: ['booking.example.com'], private_admin: 'DO_NOT_EXPOSE', rules: [{ place_id: 'ticketed-google-place', url: 'https://booking.example.com/exact-product?ref=demo' }] }));
    const created = await call('/entities/Trip', 'POST', { name: 'Phase four', destination: 'Rome', start_date: '2026-10-01', end_date: '2026-10-03', travel_type: 'train', arrival_location: 'Roma Termini', arrival_datetime: '2026-10-01T08:00', transport_preference: 'taxi' }, first.cookie);
    const tripId = created.data.id;
    const places = [1,2,3].map(day => ({ id: randomUUID(), trip_id: tripId, name: 'Stop ' + day, address: 'Rome', fixed_date: '2026-10-0' + day, priority: 'mandatory', desired_duration_min: 45, ticket_type: 'entry', place_id: day === 1 ? 'ticketed-google-place' : null }));
    await call('/trips/' + tripId + '/planning/places', 'PUT', { items: places }, first.cookie);
    assert.equal((await call('/trips/' + tripId + '/itinerary', 'GET', undefined, second.cookie)).status, 404);
    assert.equal((await call('/trips/' + tripId + '/itinerary/edit', 'POST', {}, second.cookie)).status, 404);
    const generated = await call('/trips/' + tripId + '/itinerary', 'POST', { use_ai: false }, first.cookie);
    assert.equal(generated.status, 200, JSON.stringify(generated.data));
    assert.equal(generated.data.dates.length, 3);
    assert.equal(generated.data.items.filter(item => item.step_type === 'visit').length, 3);
    const target = generated.data.items.find(item => item.selection_id === places[0].id);
    assert(target.booking.url.includes('exact-product')); assert(!JSON.stringify(generated.data).includes('DO_NOT_EXPOSE'));
    const loaded = await call('/trips/' + tripId + '/itinerary', 'GET', undefined, first.cookie);
    assert.deepEqual(loaded.data.items, generated.data.items);
    const untouched = loaded.data.items.filter(item => item.date === '2026-10-03');
    const edit = { item_id: target.id, expected_version: loaded.data.version, name: target.title, address: target.address, date: '2026-10-02', duration_min: 45, start_time: '' };
    const moved = await call('/trips/' + tripId + '/itinerary/edit', 'POST', edit, first.cookie);
    assert.equal(moved.status, 200, JSON.stringify(moved.data));
    assert.equal(moved.data.items.find(item => item.selection_id === places[0].id).date, '2026-10-02');
    assert.deepEqual(moved.data.items.filter(item => item.date === '2026-10-03'), untouched);
    assert.equal((await call('/trips/' + tripId + '/itinerary/edit', 'POST', edit, first.cookie)).status, 409);
    const moving = moved.data.items.find(item => item.selection_id === places[0].id);
    const impossible = await call('/trips/' + tripId + '/itinerary/edit', 'POST', { ...edit, item_id: moving.id, expected_version: moved.data.version, duration_min: 480, start_time: '18:00' }, first.cookie);
    assert.equal(impossible.status, 400);
    assert.deepEqual((await call('/trips/' + tripId + '/itinerary', 'GET', undefined, first.cookie)).data.items, moved.data.items);
    const replaced = await call('/trips/' + tripId + '/itinerary/edit', 'POST', { ...edit, item_id: moving.id, expected_version: moved.data.version, name: 'Replacement garden', address: 'New address' }, first.cookie);
    assert.equal(replaced.status, 200, JSON.stringify(replaced.data));
    const replacement = replaced.data.items.find(item => item.selection_id === places[0].id);
    assert.equal(replacement.title, 'Replacement garden'); assert.equal(replacement.place_id, null); assert.equal(replacement.booking, null); assert.equal(replacement.ticket_status, 'to_verify');
    const placeRecord = await call('/entities/PlaceSelection/' + places[0].id, 'GET', undefined, first.cookie);
    assert.equal(placeRecord.data.fixed_date, '2026-10-02'); assert.equal(placeRecord.data.name, 'Replacement garden');
    assert.equal((await call('/trips/' + tripId + '/itinerary', 'POST', { expected_version: 0 }, first.cookie)).status, 409);
    const shared = await call('/trips/' + tripId + '/share', 'POST', { enabled: true, hideStay: true }, first.cookie);
    const publicPlan = await call('/shared/' + shared.data.share_token);
    assert(!JSON.stringify(publicPlan.data).includes('booking.example.com'));
    assert(!JSON.stringify(publicPlan.data).includes('Roma Termini'));
    const originalFetch = globalThis.fetch;
    const oldAI = [config.aiKey, config.aiModel]; config.aiKey = 'fixture'; config.aiModel = 'fixture-model';
    t.after(() => { [config.aiKey, config.aiModel] = oldAI; });
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
      const body = JSON.parse(options.body), context = JSON.parse(body.input);
      assert.equal(body.text.format.name, 'itinerary_route');
      await originalFetch(origin + '/entities/Trip/' + tripId, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TripSync', Cookie: first.cookie }, body: JSON.stringify({ pace: 'relaxed' }) });
      return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ visits: context.selected.map(place => ({ selection_id: place.selection_id, date: place.fixed_date || context.allowed_dates[0], preferred_start: place.fixed_time || '', reason: 'Nearby route' })) }) }] }] }));
    });
    const concurrent = await call('/trips/' + tripId + '/itinerary', 'POST', { use_ai: true, expected_version: replaced.data.version }, first.cookie);
    assert.equal(concurrent.status, 409);
    assert.deepEqual((await call('/trips/' + tripId + '/itinerary', 'GET', undefined, first.cookie)).data.items, replaced.data.items);
    const legacy = await call('/entities/Trip', 'POST', { name: 'Legacy schedule', destination: 'Rome', start_date: '2026-10-01', end_date: '2026-10-02' }, first.cookie);
    const legacyPlace = await call('/entities/PlaceSelection', 'POST', { trip_id: legacy.data.id, name: 'Legacy visit', address: 'Rome', priority: 'mandatory', desired_duration_min: 45 }, first.cookie);
    const legacyItem = await call('/entities/ItineraryItem', 'POST', { trip_id: legacy.data.id, title: 'Legacy visit', date: '2026-10-01', step_type: 'visit', start_time: '10:00', end_time: '10:45', duration_min: 45, location: 'Rome' }, first.cookie);
    assert.equal((await call('/trips/' + legacy.data.id + '/itinerary', 'GET', undefined, first.cookie)).data.generation, 'legacy');
    const legacyEdit = await call('/trips/' + legacy.data.id + '/itinerary/edit', 'POST', { item_id: legacyItem.data.id, expected_version: 0, name: 'Legacy visit', address: 'Rome', date: '2026-10-02', duration_min: 45, start_time: '' }, first.cookie);
    assert.equal(legacyEdit.status, 200, JSON.stringify(legacyEdit.data));
    assert.equal(legacyEdit.data.items.find(item => item.step_type === 'visit').selection_id, legacyPlace.data.id);
  });

  await t.test('JSON import preserves all entity relationships and rolls back collisions', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const path = await import('node:path');
    const execute = promisify(execFile);
    const directory = path.resolve('.local/import-integration', randomUUID());
    const uploads = path.join(directory, 'uploads');
    await mkdir(directory, { recursive: true });
    const owner = randomUUID(), importedTrip = randomUUID(), itemId = randomUUID(), boardId = randomUUID();
    ids.push(owner);
    const avatar = 'https://media.base44.com/example/avatar.png';
    await writeFile(path.join(directory, 'avatar.png'), Buffer.from([137,80,78,71,13,10,26,10]));
    await writeFile(path.join(directory, 'files.json'), JSON.stringify({ [avatar]: 'avatar.png' }));
    const exportData = {
      User: [{ id: owner, email: owner + '@import.example.test', avatar_url: avatar }],
      Trip: [{ id: importedTrip, name: 'Imported trip', created_by_id: owner, share_enabled: true, share_token: 'old-token', created_date: '2025-01-02T03:04:05.000Z' }],
      TripItem: [{ id: itemId, trip_id: importedTrip, title: 'Imported hotel', category: 'stay' }],
      PlaceSelection: [{ id: randomUUID(), trip_id: importedTrip, trip_item_id: itemId, name: 'Imported place' }],
      DayWindow: [{ id: randomUUID(), trip_id: importedTrip, date: '2026-10-01', windows: '[{"start":"09:00","end":"18:00"}]' }],
      ItineraryItem: [{ id: randomUUID(), trip_id: importedTrip, date: '2026-10-01', step_type: 'visit', title: 'Imported visit' }],
      TodoBoard: [{ id: boardId, name: 'Imported list', created_by_id: owner }],
      TodoItem: [{ id: randomUUID(), board_id: boardId, title: 'Imported task', done: true }],
    };
    const source = path.join(directory, 'export.json');
    await writeFile(source, JSON.stringify(exportData));
    const args = ['scripts/import-data.mjs', source, '--media-map=' + path.join(directory, 'files.json'), '--apply'];
    const options = { env: { ...process.env, UPLOAD_DIR: uploads } };
    const imported = await execute(process.execPath, args, options);
    assert.match(imported.stdout, /Import committed/);
    const { tables } = await import('../schema.js');
    for (const table of Object.values(tables)) {
      const [rows] = await pool.execute(`SELECT COUNT(*) AS n FROM ${table} WHERE owner_id=?`, [owner]);
      assert.equal(rows[0].n, 1, table);
    }
    const [trips] = await pool.execute('SELECT share_enabled,share_token,created_date FROM trips WHERE id=?', [importedTrip]);
    assert.equal(trips[0].share_enabled, 0);
    assert.equal(trips[0].share_token, null);
    assert(trips[0].created_date.startsWith('2025-01-02 03:04:05'));
    const [profiles] = await pool.execute('SELECT password_hash,avatar_url FROM users WHERE id=?', [owner]);
    assert.equal(profiles[0].password_hash, null);
    assert.match(profiles[0].avatar_url, /^\/api\/uploads\//);
    assert.equal((await readdir(uploads)).length, 1);

    // Copying a file and inserting a new user must also roll back if a later ID collides.
    const collisionOwner = randomUUID(); ids.push(collisionOwner);
    exportData.User[0] = { ...exportData.User[0], id: collisionOwner, email: collisionOwner + '@import.example.test' };
    exportData.Trip[0].created_by_id = collisionOwner;
    exportData.TodoBoard[0].created_by_id = collisionOwner;
    await writeFile(source, JSON.stringify(exportData));
    await assert.rejects(() => execute(process.execPath, args, options), error => error.stderr.includes('ER_DUP_ENTRY'));
    const [rolledBack] = await pool.execute('SELECT id FROM users WHERE id=?', [collisionOwner]);
    assert.equal(rolledBack.length, 0);
    assert.equal((await readdir(uploads)).length, 1, 'Files copied by a failed import must be removed.');
    const [original] = await pool.execute('SELECT owner_id,name FROM trips WHERE id=?', [importedTrip]);
    assert.deepEqual(original[0], { owner_id: owner, name: 'Imported trip' });
  });
});
