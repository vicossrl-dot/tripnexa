import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openBrowser } from './browser-driver.mjs';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// UI fixture only: no database, provider, AI or production requests.
const dist = path.resolve('dist');
await fs.access(path.join(dist, 'index.html'));
const server = createServer(async (req, res) => {
  const requested = path.resolve(dist, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!requested.startsWith(dist + path.sep) && requested !== dist) { res.writeHead(403).end(); return; }
  let filename = requested;
  try { if (!(await fs.stat(filename)).isFile()) filename = path.join(dist, 'index.html'); }
  catch { filename = path.join(dist, 'index.html'); }
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };
  res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
  res.end(await fs.readFile(filename));
}).listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const artifact = path.resolve('.local/i18n/browser-' + randomUUID());
await fs.mkdir(artifact, { recursive: true });
let fixtureBrowser;
try {
  fixtureBrowser = await openBrowser(artifact);
  const { command, exceptions } = fixtureBrowser;
  const sessionId = undefined;
  await command('Network.enable', {}, sessionId); await command('Network.setBlockedURLs', { urls: ['https://*'] }, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fixtureErrors=[];window.addEventListener('error',event=>window.fixtureErrors.push(event.error?.stack||event.message));
    const user=()=>JSON.parse(localStorage.getItem('fixture.user')||'null');
    const original=window.fetch.bind(window);
    window.fetch=async(input,options={})=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href),p=url.pathname;
      if(!p.startsWith('/api/'))return original(input,options);
      let data={},status=200;
      if(p==='/api/auth/me'&&options.method==='PATCH'){data={...user(),...JSON.parse(options.body)};localStorage.setItem('fixture.user',JSON.stringify(data));}
      else if(p==='/api/auth/me'){data=user();if(!data){status=401;data={error:'Authentication required.'};}}
      else if(p==='/api/auth/login'){data={id:'fixture-user',email:'fixture@example.test',display_name:'Fixture traveler',role:'USER',ui_locale:'de'};localStorage.setItem('fixture.user',JSON.stringify(data));}
      else if(p==='/api/entities/Trip')data=[{id:'fixture-trip',name:'Unique private trip title',destination:'Rome',start_date:'2026-10-08',end_date:'2026-10-09'}];
      else if(p==='/api/entities/Trip/fixture-trip')data={id:'fixture-trip',name:'Unique private trip title',destination:'Rome',start_date:'2026-10-08',end_date:'2026-10-09',adults:2};
      else if(p.startsWith('/api/entities/'))data=[];
      else if(p==='/api/trips/fixture-trip/itinerary')data={items:[],dates:['2026-10-08','2026-10-09'],conflicts:[]};
      else if(p==='/api/trips/fixture-trip/wallet')data={items:[]};
      else if(p==='/api/trips/fixture-trip/health')data={status:'READY',issues:[],checks:[],beforeGo:[],nextActions:[],ready:true,optionalSaved:0};
      else if(p==='/api/billing/trips/fixture-trip')data={premium:false};
      else if(p==='/api/auth/logout'){localStorage.removeItem('fixture.user');data={};}
      else if(p==='/api/billing/status')data={enabled:false};
      else if(p==='/api/billing/orders')data={items:[]};
      else if(p==='/api/application-urls')data={};
      else if(p==='/api/auth/providers')data={providers:[]};
      return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    };
  ` }, sessionId);
  const evaluate = async expression => {
    const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
    return result.result.value;
  };
  const wait = async expression => { for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 100)); } console.error(JSON.stringify({ body: await evaluate('document.body.innerText'), errors: await evaluate('window.fixtureErrors'), exceptions })); throw Error('UI wait timed out: ' + expression); };
  await command('Page.navigate', { url: origin + '/login' }, sessionId);
  await wait(`!!document.querySelector('input[type=email]')`);
  await evaluate(`const email=document.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(email,'unsaved@example.test');email.dispatchEvent(new Event('input',{bubbles:true}));`);
  await evaluate(`document.querySelector('button[aria-label="Select language"]').click()`);
  await wait(`!!document.querySelector('[role=dialog]')`);
  const names = { en: 'English', ro: 'Română', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español' };
  for (const [code, name] of Object.entries(names)) {
    await evaluate(`Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.trim()===${JSON.stringify(name)}).click()`);
    await wait(`document.documentElement.lang===${JSON.stringify(code)}`);
    assert.equal(await evaluate(`document.querySelector('input[type=email]').value`), 'unsaved@example.test');
    assert.equal(await evaluate(`document.querySelector('[role=dialog] button[lang=${code}]').getAttribute('aria-pressed')`), 'true');
    const catalog = JSON.parse(await fs.readFile('src/i18n/locales/' + code + '.json', 'utf8'));
    assert.equal(await evaluate(`document.querySelector('[role=dialog] h2').textContent`), catalog['language.select']);
    const validateEmail=async value=>evaluate(`(()=>{const field=document.querySelector('input[type=email]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));field.checkValidity();return field.validationMessage;})()`);
    assert.equal(await validateEmail(''),catalog['validation.required'],'Required-field validation follows '+code);
    assert.equal(await validateEmail('not-a-valid-address'),catalog['validation.email'],'Email validation follows '+code);
    await validateEmail('unsaved@example.test');
  }
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }, sessionId);
  await wait(`!document.querySelector('[role=dialog]')`);
  assert.equal(await evaluate(`document.activeElement.tagName`), 'BUTTON', 'Dialog restores trigger focus');
  await evaluate(`document.querySelector('button[aria-label]').click()`);
  await wait(`!!document.querySelector('[role=dialog]')`);
  await evaluate(`document.querySelector('[role=dialog] button[lang=ro]').click()`);
  await command('Page.reload', {}, sessionId);
  await wait(`document.documentElement.lang==='ro' && !!document.querySelector('input[type=email]')`);
  // Guest choice must beat the existing account preference on login.
  await evaluate(`document.querySelector('input[type=email]').value='fixture@example.test';document.querySelector('input[type=password]').value='fixture password 1234';document.querySelector('form').requestSubmit()`);
  await wait(`location.pathname==='/' && document.documentElement.lang==='ro'`);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('fixture.user')).ui_locale`), 'ro');
  assert.equal(await evaluate(`sessionStorage.getItem('tripnexa.locale.pending')`), null);
  await command('Page.navigate', { url: origin + '/profile' }, sessionId);
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Română'))`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Română')).click()`);
  await wait(`!!document.querySelector('[role=dialog]')`);
  await evaluate(`document.querySelector('[role=dialog] button[lang=fr]').click()`);
  await wait(`JSON.parse(localStorage.getItem('fixture.user')).ui_locale==='fr'`);
  await command('Page.reload', {}, sessionId);
  await wait(`document.documentElement.lang==='fr'`);
  await evaluate(`localStorage.setItem('tripnexa.locale','es')`);
  await command('Page.reload', {}, sessionId);
  await wait(`document.documentElement.lang==='fr'`, 'Authenticated saved preference beats local fallback');
  await command('Page.navigate', { url: origin + '/trip/fixture-trip' }, sessionId);
  await wait(`!!document.querySelector('.trip-navigation button[aria-label]')`);
  assert.equal(await evaluate(`document.querySelector('.trip-wordmark p').textContent`), 'Unique private trip title');
  await evaluate(`document.querySelector('.trip-navigation button[aria-label]').click()`);
  await wait(`!!document.querySelector('[role=dialog]')`);
  await command('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: true }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 500));
  const screenshot = await command('Page.captureScreenshot', { format: 'png' }, sessionId);
  await fs.writeFile(path.join(artifact, 'language-mobile.png'), Buffer.from(screenshot.data, 'base64'));
  assert(await evaluate(`document.querySelector('[role=dialog]').getBoundingClientRect().width<=innerWidth`), 'Language dialog fits mobile viewport');
  await command('Page.navigate', { url: origin + '/admin' }, sessionId);
  await wait(`document.documentElement.lang==='en'`);
  assert.equal(exceptions.length, 0, exceptions.join('\n'));
  await fs.writeFile(path.join(artifact, 'result.json'), JSON.stringify({ passed: true, browser: 'Chrome', fixture: true, locales: Object.keys(names), assertions: ['immediate language change', 'unsaved input retained', 'dialog Escape and focus', 'local reload persistence', 'guest choice beats account', 'authenticated preference persistence', 'account preference beats local', 'admin English'] }, null, 2));
  console.log('i18n browser fixture passed: six locales, immediate updates, required/email validation, input/focus preservation, guest/account precedence and persistence, Admin English.');
} finally {
  if (fixtureBrowser) await fixtureBrowser.close(); await new Promise(resolve => server.close(resolve));
}
