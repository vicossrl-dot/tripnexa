import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
let fixture;
const mockProviders = process.argv.includes('--mock-providers');
assert(!mockProviders || process.argv.includes('--full'), '--mock-providers requires --full.');
if (process.argv.includes('--full')) {
  assert.match(process.env.MYSQL_TEST_DATABASE || '', /_test$/, 'Full browser tests require MYSQL_TEST_DATABASE ending in _test.');
  process.env.MYSQL_DATABASE = process.env.MYSQL_TEST_DATABASE;
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = '';
  const { pool } = await import('../server/db.js');
  const { migrate } = await import('../server/migrate.js');
  const { hashPassword } = await import('../server/security.js');
  const { config } = await import('../server/config.js');
  const { createApp } = await import('../server/app.js');
  // Test-only provider simulation; no live provider calls or paid requests.
  config.googleMapsKey = mockProviders ? 'fixture-google-key' : '';
  config.aiKey = mockProviders ? 'fixture-openai-key' : '';
  config.aiModel = mockProviders ? 'fixture-model' : '';
  config.imageModel = '';
  const originalFetch = globalThis.fetch;
  if (mockProviders) globalThis.fetch = async (url, options) => {
    const address = String(url);
    const result = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    if (address === 'https://places.googleapis.com/v1/places:autocomplete') {
      const input = JSON.parse(options.body).input.toLowerCase();
      const name = input.includes('colo') ? 'Colosseum' : input.includes('trevi') ? 'Trevi Fountain' : 'Rome';
      return result({ suggestions: [{ placePrediction: { placeId: 'fixture_' + name.toLowerCase().replaceAll(' ', '_'), text: { text: name + ', Rome, Italy' } } }] });
    }
    if (address === 'https://places.googleapis.com/v1/places:searchText') {
      const name=JSON.parse(options.body).textQuery.split(',')[0];
      return result({places:[{id:'fixture_'+name.toLowerCase().replaceAll(' ','_'),displayName:{text:name},formattedAddress:name+', Rome, Italy',location:{latitude:41.9,longitude:12.5},addressComponents:[]}]});
    }
    if (address.startsWith('https://places.googleapis.com/v1/places/')) {
      const id = new URL(address).pathname.split('/').pop();
      const name = id === 'fixture_colosseum' ? 'Colosseum' : id === 'fixture_trevi_fountain' ? 'Trevi Fountain' : 'Rome';
      return result({ id, displayName: { text: name }, formattedAddress: name + ', Metropolitan City of Rome, Italy', primaryType: 'historical_landmark', addressComponents: [{ longText: 'Rome', types: ['locality'] }, { longText: 'Italy', types: ['country'] }], location: { latitude: 41.9, longitude: 12.5 } });
    }
    if (address.startsWith('https://maps.googleapis.com/maps/api/timezone/')) return result({ status: 'OK', timeZoneId: 'Europe/Rome' });
    if (address === 'https://api.openai.com/v1/responses') {
      const body = JSON.parse(options.body);
      if (body.text.format.name === 'itinerary_route') {
        const context = JSON.parse(body.input);
        return result({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ visits: context.selected.map(place => ({ selection_id: place.selection_id, date: place.fixed_date || context.allowed_dates[0], preferred_start: place.fixed_time || '', reason: 'Grouped near the hotel; verify opening hours.' })) }) }] }] });
      }
      if (body.text.format.name === 'planning_suggestions') {
        if (fixture?.failPlanning) { fixture.failPlanning = false; return new Response('{}', { status: 503 }); }
        const context = JSON.parse(body.input);
        assert(context.trip.exclusions.includes('No museums'));
        assert(context.places.some(place => place.name === 'Colosseum'));
        const suggestion = (name, category = 'nature') => ({ name, aliases: [], category, fit_reason: 'An outdoor stop suited to your nature interest near central Rome.', area: 'Centro', address: 'Rome, Italy', visit_duration_min: 45, best_time_of_day: 'morning', indoor_outdoor: 'outdoor' });
        const data = { suggestions: [suggestion('Colosseum'), suggestion('Villa Borghese'), suggestion('Villa Bórghese!'), suggestion('Capitoline Museum', 'museum'), suggestion('Orange Garden')] };
        return result({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
      }
      const empty = schema => schema.type === 'object' ? Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, empty(value)])) : schema.type === 'array' ? [] : schema.type === 'boolean' ? false : schema.type === 'number' ? 0 : schema.enum?.[0] || '';
      const data = body.text.format.name === 'trip_names' ? { names: ['Roman Holiday','Roam Rome','Roman Tracks'] } : empty(body.text.format.schema);
      return result({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }] });
    }
    return originalFetch(url, options);
  };
  await migrate();
  const id = randomUUID();
  const email = id + '@browser.example.test';
  const password = 'browser smoke password 1234';
  await pool.execute('INSERT INTO users (id,email,password_hash,email_verified,display_name) VALUES (?,?,?,TRUE,?)', [id, email, await hashPassword(password), 'Smoke Traveler']);
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  process.env.SMOKE_URL = `http://127.0.0.1:${server.address().port}`;
  config.appUrl=process.env.SMOKE_URL;process.env.PUBLIC_APP_URL=config.appUrl;
  await mkdir('.local/browser-smoke', { recursive: true });
  const referralFile = path.resolve('.local/browser-smoke/referrals-' + id + '.json');
  await writeFile(referralFile, JSON.stringify({ allowed_hosts: ['booking.example.com'], admin_secret: 'PRIVATE_REFERRAL_FIXTURE', rules: [{ place_id: 'phase4-colosseum', url: 'https://booking.example.com/colosseum?affiliate=test' }] }));
  config.referralFile = referralFile;
  fixture = { id, email, password, pool, server, originalFetch, referralFile };
}
const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir('.local/browser-smoke', { recursive: true });
const chrome = spawn(executable, ['--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + path.resolve('.local/browser-smoke/profile'), 'about:blank'], { windowsHide: true, stdio: ['ignore','ignore','pipe'] });
let browser;
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Browser startup timed out.')), 20000);
    chrome.on('error', reject);
    chrome.stderr.on('data', chunk => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  browser = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { browser.addEventListener('open', resolve); browser.addEventListener('error', reject); });
  let id = 0;
  const pending = new Map();
  const requests = [];
  const exceptions = [];
  browser.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id); pending.delete(message.id); clearTimeout(timer);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
  });
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Timed out: ' + method)); }, 15000);
    pending.set(requestId, { resolve, reject, timer });
    browser.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Page.enable', {}, sessionId);
  await command('Network.enable', {}, sessionId);
  await command('Runtime.enable', {}, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const root = process.env.SMOKE_URL || 'http://127.0.0.1:5173';
  for (const [route, expected] of [['/login','Welcome back'],['/register','Create'],['/forgot-password','Reset password'],['/','Welcome back']]) {
    await command('Page.navigate', { url: root + route }, sessionId);
    let content = '';
    for (let attempt=0;attempt<30;attempt++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const result = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true }, sessionId);
      content = result.result.value || '';
      if (content.includes(expected)) break;
    }
    if (!content.includes(expected)) {
      const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile('.local/browser-smoke/failure.png', Buffer.from(screenshot.data, 'base64'));
      console.error('Visible page:', content.slice(0, 2000));
      console.error('JavaScript exceptions:', exceptions);
    }
    assert(content.includes(expected), `Page ${route} did not show ${expected}.`);
    assert(!content.includes('Continue with Google'), 'Local authentication should not expose a platform login button.');
    console.log('Browser page passed: ' + route);
  }
  if (fixture) {
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed.');
      return result.result.value;
    };
    const waitText = async (expected, selector = 'body') => {
      for (let i=0;i<40;i++) {
        if ((await evaluate(`document.querySelector(${JSON.stringify(selector)})?.innerText || ''`)).toLowerCase().includes(expected.toLowerCase())) return;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
      await writeFile('.local/browser-smoke/failure.png', Buffer.from(screenshot.data, 'base64'));
      console.error('Visible page:', (await evaluate('document.body.innerText')).slice(0, 3000));
      console.error('JavaScript exceptions:', exceptions);
      throw new Error('Expected browser content: ' + expected);
    };
    await command('Page.navigate', { url: root + '/profile?source=smoke' }, sessionId);
    await waitText('Welcome back');
    assert.equal(await evaluate("new URLSearchParams(location.search).get('returnTo')"), '/profile?source=smoke');
    await evaluate(`(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [id,value] of ${JSON.stringify([['email',fixture.email],['password',fixture.password]])}) {
        const input=document.getElementById(id); set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true}));
      }
    })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await evaluate("document.querySelector('form').requestSubmit()");
    await waitText('Smoke Traveler');
    assert.equal(await evaluate('location.pathname + location.search'), '/profile?source=smoke');
    await evaluate(`window.__navigationSmoke=true; document.querySelector('a[title="Back home"]').click()`);
    await waitText('Your Trips');
    assert.equal(await evaluate('window.__navigationSmoke'), true, 'React links should navigate without reloading the page.');
    await evaluate('history.back()');
    await waitText('Smoke Traveler');
    await evaluate('history.forward()');
    await waitText('Your Trips');
    console.log('Protected redirect, login return path, links and browser history passed.');
    const api = async (url, body, method = 'POST') => {
      const result = await evaluate(`fetch(${JSON.stringify('/api' + url)}, { method:${JSON.stringify(method)}, headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'}, body:${JSON.stringify(body ? JSON.stringify(body) : undefined)} }).then(async r=>({status:r.status,data:await r.json()}))`);
      assert(result.status < 400, JSON.stringify(result));
      return result.data;
    };
    await waitText('New Trip');
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('New Trip')).click()`);
    await waitText('Every great story starts with a ticket.');
    await evaluate(`(() => {
      const inputs=document.querySelectorAll('[role="dialog"] input');
      inputs[0].focus();
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      for(const [i,value] of ['Rome','Smoke trip'].entries()) { set.call(inputs[i],value); inputs[i].dispatchEvent(new Event('input',{bubbles:true})); }
    })()`);
    if (mockProviders) {
      await waitText('Rome, Italy', '[role="listbox"]');
      await evaluate(`(() => { const input=document.getElementById('trip-destination'); input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); })()`);
      await new Promise(resolve => setTimeout(resolve, 100));
      await evaluate(`document.getElementById('trip-destination').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
      await waitText('Destination and timezone selected.');
    }
    await evaluate(`document.getElementById('travel-type').value='train'; document.getElementById('travel-type').dispatchEvent(new Event('change',{bubbles:true}))`);
    await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.includes('spicy name')).click()`);
    await waitText(mockProviders ? 'Three ideas for your trip' : 'Here are three simple ideas');
    const names = await evaluate(`Array.from(document.querySelectorAll('[aria-label="Trip name suggestions"] button')).map(b=>b.textContent)`);
    assert.equal(names.length, 3); assert(names.every(name => name.split(' ').length <= 3));
    assert.equal(await evaluate("document.getElementById('trip-name').value"), names[0]);
    await evaluate(`document.querySelectorAll('[aria-label="Trip name suggestions"] button')[1].click()`);
    assert.equal(await evaluate("document.getElementById('trip-name').value"), names[1]);
    const entryScreenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile('.local/browser-smoke/phase-one-entry.png', Buffer.from(entryScreenshot.data, 'base64'));
    await evaluate(`(() => { const input=document.getElementById('trip-name'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Smoke trip'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await new Promise(resolve => setTimeout(resolve, 100));
    await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] button')).find(b=>b.textContent.startsWith("Let's go")).click()`);
    await waitText('Continue planning');
    const tripId = await evaluate("location.pathname.split('/')[2]");
    assert.match(tripId, /^[a-f0-9-]{36}$/);
    assert.equal(await evaluate("document.querySelector('[data-travel-background]').getAttribute('data-travel-background')"), 'train');
    assert(await evaluate("document.querySelector('[data-travel-background] img').getAttribute('src').endsWith('/train.svg')"));
    const initialTrip = await api('/entities/Trip/' + tripId, undefined, 'GET');
    assert.equal(initialTrip.travel_type, 'train');
    if (mockProviders) {
      assert.equal(initialTrip.destination_place_id, 'fixture_rome'); assert.equal(initialTrip.destination_city, 'Rome');
      assert.equal(initialTrip.country, 'Italy'); assert.equal(initialTrip.timezone, 'Europe/Rome');
      assert.equal(initialTrip.destination_latitude, 41.9); assert.equal(initialTrip.destination_longitude, 12.5);
    }
    const heroScreenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile('.local/browser-smoke/phase-one-dashboard.png', Buffer.from(heroScreenshot.data, 'base64'));
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 300));
    const mobileScreenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile('.local/browser-smoke/phase-one-mobile.png', Buffer.from(mobileScreenshot.data, 'base64'));
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await evaluate(`Array.from(document.querySelectorAll('a')).find(el=>el.textContent==='Continue planning').click()`);
    await waitText('Destination & time');
    assert.equal(await evaluate('location.pathname'), '/trip/' + tripId + '/plan');
    assert.equal(await evaluate("document.getElementById('travel-type').value"), 'train');
    assert.equal(await evaluate("document.querySelector('[role=dialog]') === null"), true);
    const trip = await api('/entities/Trip/' + tripId, { country: 'Italy', timezone: 'Europe/Rome', start_date: '2026-10-01', end_date: '2026-10-02', currency: 'EUR' }, 'PATCH');
    assert.equal(trip.name, 'Smoke trip');
    console.log('New trip form and programmatic navigation passed.');
    await api('/entities/TripItem', { trip_id: trip.id, title: 'Smoke document', category: 'document', image_url: '/media/placeholder.svg' });
    await api('/trips/' + trip.id + '/planning/windows', { items: [{ id: randomUUID(), trip_id: trip.id, date: '2026-10-01', windows: '[{"start":"09:00","end":"18:00"}]', blocked: '[]' }] }, 'PUT');
    await api('/trips/' + trip.id + '/planning/places', { items: [{ id: randomUUID(), trip_id: trip.id, name: 'Museum visit', address: 'Rome', priority: 'mandatory', desired_duration_min: 60, ticket_type: 'none' }] }, 'PUT');
    await api('/trips/' + trip.id + '/itinerary');
    const shared = await api('/trips/' + trip.id + '/share', { enabled: true, hideStay: true });
    for (const [route, expected] of [
      ['/trip/' + trip.id, 'Update Plan'],
      ['/trip/' + trip.id + '/documents', 'Smoke document'],
      ['/trip/' + trip.id + '/plan', 'Destination & time'],
      ['/trip/' + trip.id + '/itinerary', 'Museum visit'],
      ['/profile', 'Smoke Traveler'],
    ]) {
      await command('Page.navigate', { url: root + route }, sessionId);
      await waitText(expected);
      if (route.endsWith('/plan')) {
        for (const [stepName, stepText] of [
          ['Stay', 'Have you booked your stay?'],
          ['Preferences', 'Daily planning hours'],
          ['Desired places', 'Search a desired place'],
          ['Suggestions', 'Additional ideas for your trip'],
          ['Itinerary & tickets', 'Build your schedule'],
        ]) {
          for(let pending=0;pending<50;pending++){if(await evaluate(`!document.querySelector('[data-plan-step]').disabled`))break;await new Promise(resolve=>setTimeout(resolve,100));}
          await evaluate(`Array.from(document.querySelectorAll('header button')).find(b => b.textContent.endsWith(${JSON.stringify(stepName)})).click()`);
          await waitText(stepText, 'main');
          if (stepName === 'Preferences') {
            await evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim()==='Nature').click()`);
            await evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent.trim()==='No museums').click()`);
          }
          if (stepName === 'Desired places') {
            assert(await evaluate(`Array.from(document.querySelectorAll('main input')).some(input => input.value==='Museum visit')`), 'Saved places should appear in the editor.');
            for (const name of mockProviders ? ['Colosseum', 'Trevi Fountain', 'Colosseum'] : ['Manual garden', 'Manual garden']) {
              await evaluate(`(() => { const input=document.getElementById('desired-place-search'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(name)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
              if (mockProviders) {
                await waitText(name, '[role="listbox"]');
                await evaluate(`document.querySelector('[role="option"]').click()`);
                if (name === 'Colosseum' && await evaluate(`document.body.innerText.includes('already in your list')`)) break;
                await waitText('Place selected');
              } else {
                await new Promise(resolve => setTimeout(resolve, 100));
                await evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent.includes('Add manually')).click()`);
              }
            }
            await waitText('already in your list');
            assert.equal(await evaluate(`document.querySelectorAll('[data-desired-place]').length`), mockProviders ? 3 : 2);
            fixture.failPlanning = mockProviders;
            const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
            await writeFile('.local/browser-smoke/phase-three-places.png', Buffer.from(screenshot.data, 'base64'));
          }
          if (stepName === 'Suggestions' && mockProviders) {
            await waitText('Your saved places are unchanged');
            await evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent==='Generate suggestions').click()`);
            await waitText('Villa Borghese');
            assert.equal(await evaluate(`document.querySelectorAll('[data-suggestion-card]').length`), 2, 'Desired places, duplicates and excluded museums must be removed.');
            const clickCard = async (name, action) => evaluate(`(() => { const card=Array.from(document.querySelectorAll('[data-suggestion-card]')).find(c=>c.querySelector('h3').textContent===${JSON.stringify(name)}); Array.from(card.querySelectorAll('button')).find(b=>b.textContent===${JSON.stringify(action)}).click(); })()`);
            await clickCard('Villa Borghese', 'Accept'); await waitText('Accepted');
            await clickCard('Villa Borghese', 'Edit');
            await evaluate(`(() => { const input=document.querySelector('[aria-label="Edit suggestion duration"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'60'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
            await new Promise(resolve => setTimeout(resolve, 100));
            await clickCard('Villa Borghese', 'Save edits');
            await clickCard('Orange Garden', 'Reject'); await waitText('Rejected');
            await evaluate(`Array.from(document.querySelectorAll('main button')).find(b => b.textContent==='Generate suggestions').click()`);
            await waitText('No additional matching places');
            const saved = await api('/entities/PlaceSelection?filter=' + encodeURIComponent(JSON.stringify({ trip_id: trip.id })), undefined, 'GET');
            assert.equal(saved.filter(place => place.name === 'Colosseum').length, 1);
            const googlePlace = saved.find(place => place.name === 'Trevi Fountain');
            assert.equal(googlePlace.city, 'Rome'); assert.equal(googlePlace.country, 'Italy'); assert.equal(googlePlace.place_id, 'fixture_trevi_fountain'); assert.equal(googlePlace.category, 'historical_landmark'); assert.equal(googlePlace.lat, 41.9);
            const accepted = saved.find(place => place.name === 'Villa Borghese');
            assert.equal(accepted.priority, 'preferred'); assert.equal(accepted.desired_duration_min, 60);
            assert.equal(saved.find(place => place.name === 'Orange Garden').priority, 'excluded');
            await command('Page.navigate', { url: root + route }, sessionId);
            await waitText('No additional matching places');
            await waitText('Accepted'); await waitText('Rejected');
            const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
            await writeFile('.local/browser-smoke/phase-three-suggestions.png', Buffer.from(screenshot.data, 'base64'));
            console.log('Phase 3: autocomplete, multiple places, duplicate/exclusion filters, AI retry and persisted accept/edit/reject passed.');
          }
          console.log('Planning step passed: ' + stepName);
        }
        await command('Page.navigate', { url: root + route }, sessionId);
        await waitText('Build your schedule', 'main');
        const saved = await api('/entities/Trip/' + trip.id, undefined, 'GET');
        assert.equal(saved.planning_step, 5);
        assert(saved.interests.split(',').includes('Nature'), 'Wizard changes should persist in MySQL.');
        console.log('Wizard autosave and reload passed.');
      }
      console.log('Authenticated browser page passed: ' + route.replace(trip.id, ':tripId'));
    }
    // Phase 4: generate, close/reopen from Home, edit and preserve unrelated days.
    const fourth = await api('/entities/Trip', { name: 'Phase Four Trip', destination: 'Rome', country: 'Italy', timezone: 'Europe/Rome', currency: 'EUR', start_date: '2026-10-01', end_date: '2026-10-03', travel_type: 'train', arrival_location: 'Roma Termini', arrival_datetime: '2026-10-01T08:00', planning_step: 5 });
    const phasePlaces = ['Colosseum','Trevi Fountain','Garden stop'].map((name,index) => ({ id: randomUUID(), trip_id: fourth.id, name, address: 'Rome', fixed_date: '2026-10-0' + (index + 1), desired_duration_min: 45, priority: 'mandatory', ticket_type: 'entry', place_id: index === 0 ? 'phase4-colosseum' : null }));
    await api('/trips/' + fourth.id + '/planning/places', { items: phasePlaces }, 'PUT');
    await command('Page.navigate', { url: root + '/trip/' + fourth.id + '/plan' }, sessionId);
    await waitText('Generate itinerary', 'main');
    await evaluate(`Array.from(document.querySelectorAll('main button')).find(b=>b.textContent==='Generate itinerary').click()`);
    await waitText('View full itinerary', 'main'); await waitText('Day 3', 'main');
    await waitText('Book / Buy ticket', 'main');
    assert(!await evaluate(`document.body.innerText.includes('PRIVATE_REFERRAL_FIXTURE')`));
    await evaluate(`Array.from(document.querySelectorAll('main a')).find(a=>a.textContent.includes('View full itinerary')).click()`);
    await waitText('Your itinerary');
    const beforeEdit = await api('/trips/' + fourth.id + '/itinerary', undefined, 'GET');
    assert.equal(beforeEdit.items.filter(item=>item.step_type==='visit').length, 3);
    await evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Trips').click()`);
    await waitText('Your Trips');
    await waitText('Phase Four Trip');
    await evaluate(`document.querySelector('a[href="/trip/${fourth.id}/itinerary"]').click()`);
    await waitText('Your itinerary');
    const editButtons = `Array.from(document.querySelectorAll('button')).filter(b=>b.textContent==='Edit / move / replace' && b.getBoundingClientRect().width>0)`;
    await evaluate(editButtons + '[0].click()');
    await waitText('Edit / replace visit', '[role="dialog"]');
    await evaluate(`(() => { for(const [label,value] of [['Visit name','Replacement garden'],['Visit address','New garden, Rome'],['Visit day','2026-10-02']]) { const input=document.querySelector('[aria-label="'+label+'"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); } })()`);
    await new Promise(resolve => setTimeout(resolve,100));
    await evaluate(`document.querySelector('[role="dialog"] form').requestSubmit()`);
    await waitText('Itinerary saved');
    const afterEdit = await api('/trips/' + fourth.id + '/itinerary', undefined, 'GET');
    const replacement = afterEdit.items.find(item=>item.selection_id===phasePlaces[0].id);
    assert.equal(replacement.date,'2026-10-02'); assert.equal(replacement.title,'Replacement garden'); assert.equal(replacement.booking,null);
    assert.deepEqual(afterEdit.items.filter(item=>item.date==='2026-10-03'),beforeEdit.items.filter(item=>item.date==='2026-10-03'));
    await command('Page.navigate', { url: root + '/trip/' + fourth.id + '/itinerary' }, sessionId);
    await waitText('Replacement garden'); await waitText('Day 3');
    const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile('.local/browser-smoke/phase-four-itinerary.png', Buffer.from(screenshot.data,'base64'));
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    const mobilePlan = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile('.local/browser-smoke/phase-four-mobile.png', Buffer.from(mobilePlan.data,'base64'));
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    console.log('Phase 4: generation, booking target, day groups, close/Home/reopen, replace/move and persisted unaffected days passed.');
    await command('Page.navigate', { url: root + '/profile' }, sessionId); await waitText('Smoke Traveler');
    const tab = await evaluate(`(() => { const r=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='To-Do').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...tab, button: 'left', clickCount: 1 }, sessionId);
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...tab, button: 'left', clickCount: 1 }, sessionId);
    await waitText('My list');
    await command('Network.clearBrowserCookies', {}, sessionId);
    await command('Page.navigate', { url: root + '/share/' + shared.share_token }, sessionId);
    await waitText('Smoke trip');
    await waitText('Museum visit');
    console.log('Anonymous public sharing page passed.');
  }
  const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
  await writeFile('.local/browser-smoke/login.png', Buffer.from(screenshot.data, 'base64'));
  assert.equal(exceptions.length, 0, exceptions.join('\n'));
  assert(!requests.some(url => /^https?:\/\/([^/]*\.)?base44\.(com|app)([/:]|$)/i.test(url)), 'A runtime request still uses the old platform.');
  console.log('No runtime platform requests or JavaScript exceptions detected.');
  await command('Browser.close');
} finally {
  browser?.close(); chrome.kill();
  if (fixture) {
    globalThis.fetch = fixture.originalFetch;
    await new Promise(resolve => fixture.server.close(resolve));
    await fixture.pool.execute('DELETE FROM users WHERE id=?', [fixture.id]);
    await fixture.pool.end();
    await unlink(fixture.referralFile);
  }
}
