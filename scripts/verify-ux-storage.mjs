import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openBrowser } from './browser-driver.mjs';
import { installFixtures } from './final-provider-fixtures.mjs';

assert(/_test$/.test(process.env.MYSQL_TEST_DATABASE||''),'Use an isolated _test database.');
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';
const {pool}=await import('../server/db.js'),{migrate}=await import('../server/migrate.js'),{config}=await import('../server/config.js'),{createApp}=await import('../server/app.js'),{hashPassword}=await import('../server/security.js');
await migrate();installFixtures(config);
const fixtureFetch=globalThis.fetch;let photoScenario='normal',photoRequests=0;
globalThis.fetch=async(url,options={})=>{
  if(String(url).startsWith('https://places.googleapis.com/')&&options.headers?.['X-Goog-FieldMask']==='photos'){
    photoRequests++;
    if(photoScenario==='empty')return Response.json({photos:[]});
    if(photoScenario==='slow')await new Promise(resolve=>setTimeout(resolve,3500));
  }
  if(photoScenario==='broken'&&String(url).startsWith('https://lh3.googleusercontent.com/'))return new Response('synthetic invalid image',{headers:{'Content-Type':'image/png'}});
  return fixtureFetch(url,options);
};
const output=path.resolve('.local/integration-setup-verification');await mkdir(output,{recursive:true});
const owner=randomUUID(),password=randomUUID()+'Strong!',email=owner+'@ux.test';
const report={mode:'Real Chrome and MySQL; synthetic Rome trip and provider fixtures; no real Bunny connection',checks:[],failures:[]};
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
const [previous]=await pool.query("SELECT * FROM app_settings WHERE setting_key IN ('billing_enforcement_enabled','storage_provider')");
let browser;const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;process.env.PUBLIC_APP_URL=origin;
try {
  for(const [key,value] of [['billing_enforcement_enabled',false],['storage_provider','local']])await pool.execute('INSERT INTO app_settings(setting_key,value,version)VALUES(?,?,1) ON DUPLICATE KEY UPDATE value=VALUES(value)',[key,JSON.stringify(value)]);
  await pool.execute('INSERT INTO users(id,email,password_hash,email_verified,role)VALUES(?,?,?,TRUE,?)',[owner,email,await hashPassword(password),'SUPER_ADMIN']);
  browser=await openBrowser(output);const {command,evaluate,wait,text,input,click,screenshot}=browser;
  const responses=[],warnings=[];let signedIn=false;
  browser.onEvent('Network.responseReceived',event=>{if(!signedIn&&event.response.status===401&&new URL(event.response.url).pathname==='/api/auth/me')return;if(event.response.url.startsWith(origin)&&event.response.status>=400)responses.push({path:new URL(event.response.url).pathname.split('/').slice(0,4).join('/'),status:event.response.status});});
  browser.onEvent('Runtime.consoleAPICalled',event=>{if(['error','warning'].includes(event.type))warnings.push(event.args.map(arg=>arg.value||arg.description||'').join(' ').slice(0,300));});
  const go=async(route,expected)=>{await command('Page.navigate',{url:origin+route});await text(expected);};
  const api=async(route,body,method=body?'POST':'GET')=>{const result=await evaluate(`fetch(${JSON.stringify('/api'+route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(result.status<400,JSON.stringify(result));return result.data;};
  await browser.viewport(1440);await go('/login','Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');signedIn=true;
  await evaluate("window.dispatchEvent(new CustomEvent('api-error',{detail:'Synthetic dismissible error'}));window.dispatchEvent(new CustomEvent('api-error',{detail:'Synthetic dismissible error'}));window.dispatchEvent(new Event('billing-unlocked'));window.dispatchEvent(new Event('billing-unlocked'))");
  await wait("document.querySelectorAll('[data-state=open][data-swipe-direction]').length===2");
  const closePoint=await evaluate("(()=>{const b=document.querySelector('[data-state=open][data-swipe-direction] [aria-label=\"Dismiss notification\"]'),r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await command('Input.dispatchMouseEvent',{type:'mousePressed',...closePoint,button:'left',clickCount:1});await command('Input.dispatchMouseEvent',{type:'mouseReleased',...closePoint,button:'left',clickCount:1});
  await wait("document.querySelectorAll('[data-state=open][data-swipe-direction]').length===1");
  await evaluate("document.querySelector('[data-state=open][data-swipe-direction] [aria-label=\"Dismiss notification\"]').click()");await wait("document.querySelectorAll('[data-state=open][data-swipe-direction]').length===0");
  await evaluate("window.dispatchEvent(new CustomEvent('api-error',{detail:'Synthetic dismissible error'}))");await wait("document.querySelectorAll('[data-state=open][data-swipe-direction]').length===1");await evaluate("document.querySelector('[data-state=open][data-swipe-direction] [aria-label=\"Dismiss notification\"]').click()");
  pass('Error duplicates do not stack, X receives real clicks, independent success toast dismisses and errors can recur');
  await go('/profile','Personal Details');
  const imageFile=path.join(output,'avatar.png');await writeFile(imageFile,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64'));
  const chooseAvatar=async(file)=>{const {root}=await command('DOM.getDocument');const {nodeId}=await command('DOM.querySelector',{nodeId:root.nodeId,selector:'input[aria-label="Profile image"]'});await command('DOM.setFileInputFiles',{nodeId,files:[file]});};
  const invalidFile=path.join(output,'invalid.txt');await writeFile(invalidFile,'not an image');await chooseAvatar(invalidFile);await text('Choose a PNG, JPEG, GIF or WebP image up to 10 MB.');assert(!(await api('/auth/me')).avatar_url);
  await chooseAvatar(imageFile);await wait("document.querySelector('img[alt=\"Profile photo\"]')?.complete&&document.querySelector('img[alt=\"Profile photo\"]')?.naturalWidth>0");
  const avatar=(await api('/auth/me')).avatar_url;assert.match(avatar,/^\/api\/uploads\//);await go('/profile','Personal Details');await wait("document.querySelector('img[alt=\"Profile photo\"]')?.naturalWidth>0");assert.equal((await api('/auth/me')).avatar_url,avatar);await screenshot('profile-avatar');
  const tooLarge=path.join(output,'large.png');await writeFile(tooLarge,Buffer.alloc(10*1024*1024+1));await chooseAvatar(tooLarge);await text('Choose a PNG, JPEG, GIF or WebP image up to 10 MB.');assert.equal((await api('/auth/me')).avatar_url,avatar);
  signedIn=false;await api('/auth/logout',{});await go('/login','Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');signedIn=true;assert.equal((await api('/auth/me')).avatar_url,avatar);
  pass('Profile image upload saves its private URL, decodes, persists across reload/login, and invalid files preserve the previous image');
  if(process.argv.includes('--live-intro')){
    const mediaState="(()=>{const v=document.querySelector('.cinematic-trips video');return v&&v.readyState>=2&&!v.paused&&v.currentTime>0&&!v.error})()";
    await wait(mediaState,30000);
    assert(await evaluate("(()=>{const v=document.querySelector('.cinematic-trips video');return v.currentSrc==='https://fast-imgs.b-cdn.net/tripnexa.mp4'&&v.muted&&v.autoplay&&v.playsInline})()"));
    await screenshot('intro-live-desktop');pass('Live intro plays inside the Trips page with muted autoplay and inline playback');
    await evaluate("document.querySelector('.cinematic-trips video').pause();document.querySelector('.cinematic-trips video').currentTime=4");
    await wait("(()=>{const v=document.querySelector('.cinematic-trips video');return !v.seeking&&Math.abs(v.currentTime-4)<0.2})()",30000);
    await evaluate("document.querySelector('.cinematic-trips video').play()");await wait("document.querySelector('.cinematic-trips video').currentTime>4.3");pass('Live intro seeks and resumes playback');
    await browser.viewport(390,900);await go('/?trips=1','Your Trips');await wait(mediaState,30000);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));await screenshot('intro-live-mobile');pass('Live intro plays at mobile width without page overflow (desktop Chrome emulation)');
    await command('Network.setBlockedURLs',{urls:['https://fast-imgs.b-cdn.net/tripnexa.mp4*']});
    await go('/?trips=1','Your Trips');await wait("[...document.querySelectorAll('.cinematic-trips img')].some(img=>img.style.opacity==='1'&&img.complete&&img.naturalWidth>0)");
    assert(await evaluate("!![...document.querySelectorAll('button')].find(button=>button.textContent.includes('New Trip'))"));
    await screenshot('intro-unavailable');pass('Unavailable CDN video shows fallback and leaves New Trip available');
    await command('Network.setBlockedURLs',{urls:[]});await browser.viewport(1440);await go('/?trips=1','Your Trips');await wait(mediaState,30000);
    // The deliberately blocked request emits a browser network error; retain all other warnings.
    for(let i=warnings.length-1;i>=0;i--)if(warnings[i].includes('ERR_BLOCKED_BY_CLIENT'))warnings.splice(i,1);
  }
  await evaluate("document.querySelector('button[aria-label=\"New Trip\"]').click()");await text('Where to next?');await input('#trip-name','Roman holiday');await screenshot('new-trip-desktop');await click("Let's go ✈");await text('Step 1 of 5');assert.match(await evaluate('location.pathname+location.search'),/\/plan\?step=0$/);pass('New Trip opens Update Plan step 1');
  const tripId=(await evaluate('location.pathname')).split('/')[2],base='/trip/'+tripId;
  const originalAdults=await evaluate("document.querySelector('[aria-label=Adults]').value");
  for(let i=0;i<5;i++)await evaluate("document.querySelector('[aria-label=\"Increase Children\"]').click()");
  await wait("document.querySelector('[aria-label=Children]').value==='5'");
  await input('[aria-label="Child 1 age"]','7');await input('[aria-label="Child 2 age"]','10');await text('Saved');
  await new Promise(resolve=>setTimeout(resolve,700));await go(base+'/plan?step=0','Children');
  assert.equal(await evaluate("document.querySelector('[aria-label=Children]').value"),'5');
  assert.equal((await api('/entities/Trip/'+tripId)).children_ages,'7,10,0,0,0');
  assert.equal(await evaluate("document.querySelector('[aria-label=Adults]').value"),originalAdults);
  await input('[aria-label=Children]','999');assert.equal(await evaluate("document.querySelector('[aria-label=Children]').value"),'10');
  for(let i=0;i<12;i++)await evaluate("document.querySelector('[aria-label=\"Decrease Children\"]').click()");
  assert.equal(await evaluate("document.querySelector('[aria-label=Children]').value"),'0');
  pass('Children rapid increments persist through API/database/reload; decrement clamps at zero');
  await new Promise(resolve=>setTimeout(resolve,800));
  await go(base,"Your itinerary hasn't been generated yet.");assert(!await evaluate("!!document.querySelector('.hero-place')"));pass('Empty itinerary has a usable destination fallback');
  const trip=await api('/entities/Trip/'+tripId,{destination:'Rome',destination_city:'Rome',country:'Italy',timezone:'Europe/Rome',currency:'EUR',start_date:'2026-10-15',end_date:'2026-10-18',adults:2,children_ages:'7,10',arrival_mode:'flight',departure_mode:'flight',max_walk_per_segment_min:27,buffer_min:13,stay_status:'booked'},'PATCH');
  await api('/entities/TripItem',{trip_id:trip.id,category:'stay',title:'Casa Roma',address:'Via del Corso, Rome',date:trip.start_date,end_date:trip.end_date,check_in_time:'15:00',check_out_time:'11:00'});
  for(const [name,id,lat,lng] of [['Colosseum','fixture_Colosseum',41.8902,12.4922],['Pantheon','fixture_Pantheon',41.8986,12.4769],['Trevi Fountain','fixture_Trevi',41.9009,12.4833]])await api('/entities/PlaceSelection',{trip_id:trip.id,name,place_id:id,city:'Rome',country:'Italy',category:'tourist_attraction',priority:'mandatory',lat,lng,address:'Rome',desired_duration_min:60});
  await api('/trips/'+trip.id+'/itinerary',{use_ai:false});
  await go('/?trips=1','Roman holiday');await click('Roman holiday','h3');await wait(`location.pathname===${JSON.stringify(base)}`);await text('Trip at a glance');pass('Existing trip card opens Overview regardless of generated itinerary');
  await wait("!!document.querySelector('.hero-place-title')");assert(await evaluate("!!document.querySelector('.hero-attribution img[alt=\"Google Maps\"]')"));pass('Overview uses itinerary place names and transient photos with attribution');
  assert(await evaluate("document.querySelector('.overview-scenery img:last-of-type').src.startsWith('blob:')"));
  const firstTitle=await evaluate("document.querySelector('.hero-place-title').textContent");photoScenario='slow';
  await evaluate("document.querySelectorAll('.hero-controls button')[2].click()");
  await new Promise(resolve=>setTimeout(resolve,500));assert.equal(await evaluate("document.querySelector('.hero-place-title').textContent"),firstTitle);
  await wait('document.querySelector(".hero-place-title")?.textContent!=='+JSON.stringify(firstTitle));pass('Slow photo response keeps the previous image and caption visible');
  photoScenario='empty';let requested=photoRequests;await go(base,'Trip at a glance');for(let attempt=0;photoRequests===requested&&attempt<30;attempt++)await new Promise(resolve=>setTimeout(resolve,100));assert(photoRequests>requested);await new Promise(resolve=>setTimeout(resolve,300));assert(!await evaluate("!!document.querySelector('.overview-scenery img')"));pass('Missing Google photos use the neutral fallback');
  photoScenario='broken';requested=photoRequests;await go(base,'Trip at a glance');for(let attempt=0;photoRequests===requested&&attempt<30;attempt++)await new Promise(resolve=>setTimeout(resolve,100));assert(photoRequests>requested);await new Promise(resolve=>setTimeout(resolve,600));assert(!await evaluate("!!document.querySelector('.overview-scenery img')"));pass('Invalid image bytes never render a broken image icon');
  assert(await evaluate("![...Object.keys(localStorage),...Object.keys(sessionStorage)].some(key=>/photo|hero/i.test(key))"));photoScenario='normal';
  await go(base+'/plan?step=0','Children');assert(!await evaluate("document.body.innerText.includes('Local timezone')||document.body.innerText.includes('Trip currency')||document.body.innerText.includes('Arrival mode')"));await click('Save & continue');await text('Accommodation & arrival');assert(!await evaluate("document.body.innerText.includes('help me find one')"));await click('Save & continue');await text('Transport & walking');assert(!await evaluate("document.body.innerText.includes('Max walking / segment')||document.body.innerText.includes('Time buffer / segment')"));
  const saved=await api('/entities/Trip/'+trip.id);for(const key of ['timezone','currency','arrival_mode','departure_mode','max_walk_per_segment_min','buffer_min'])assert.equal(saved[key],trip[key]);pass('Hidden planner fields retain existing database values');
  await go(base+'/plan?step=0','Children');await text('Uploading saves the file');
  await click('Save & continue');await text('Save time: paste your hotel link');await text('Add it once:');
  const uploadStyle=await evaluate("(()=>{const el=document.querySelector('input[type=file]'),s=getComputedStyle(el,'::file-selector-button');return {color:s.color,background:s.backgroundColor,accept:el.accept}})()");
  assert.equal(uploadStyle.color,'rgb(41, 44, 43)');assert.equal(uploadStyle.background,'rgb(255, 199, 176)');assert.equal(uploadStyle.accept,'application/pdf,image/png,image/jpeg,image/gif,image/webp');
  await evaluate("document.querySelector('input[type=file]').focus()");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('input[type=file]')).outlineStyle"),'solid');
  const disabledUpload=await evaluate("(()=>{const el=document.querySelector('input[type=file]');el.disabled=true;const s=getComputedStyle(el,'::file-selector-button');const result={color:s.color,cursor:s.cursor};el.disabled=false;return result})()");
  assert.equal(disabledUpload.cursor,'not-allowed');assert.equal(disabledUpload.color,'rgb(100, 105, 99)');
  pass('File selector uses readable peach/ink, visible keyboard focus and disabled styling; accepted types unchanged');
  for(const [width,height] of [[1440,900],[390,844],[844,390]]){await browser.viewport(width,height);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));await evaluate("[...document.querySelectorAll('p')].find(p=>p.textContent.startsWith('Save time: paste your hotel link')).scrollIntoView({block:'center'})");await screenshot('stay-helpers-'+width);}
  await go(base,'Trip at a glance');await click('Trips','a');await text('Your Trips');assert.equal(await evaluate('location.pathname'),'/');
  pass('Planner helpers match extraction capabilities and fit mobile; Trips navigation returns to dashboard');
  const [[storedTrip]]=await pool.execute('SELECT itinerary_meta FROM trips WHERE id=? AND owner_id=?',[trip.id,owner]);
  const displayMeta=JSON.parse(storedTrip.itinerary_meta);displayMeta.conflicts=[{place:'Accommodation',date:trip.start_date,reason:'Confirm the hotel address before calculating the arrival transfer. '+('Long readable warning text. '.repeat(8))}];
  await pool.execute('UPDATE trips SET itinerary_meta=? WHERE id=? AND owner_id=?',[JSON.stringify(displayMeta),trip.id,owner]);
  await go(base+'/plan?step=5','Itinerary & tickets');await text('Regenerate itinerary');
  assert(await evaluate("document.querySelectorAll('.itinerary-preview-row [data-item-icon]').length>0"));
  assert(await evaluate("[...document.querySelectorAll('.planning-step.complete .planning-step-indicator')].every(el=>!!el.querySelector('svg'))"));
  assert(await evaluate("[...document.querySelectorAll('.planning-step:not(.complete)')].every(el=>el.querySelector('.planning-step-indicator').textContent===String(Number(el.dataset.planStep)+1))"));
  for(const width of [1440,820,390]){await browser.viewport(width,900);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));await screenshot('finalize-'+width);await evaluate("document.querySelector('.scheduling-conflicts').scrollIntoView({block:'center'})");await screenshot('conflicts-'+width);await evaluate("document.querySelector('.itinerary-preview-row').scrollIntoView({block:'center'})");await screenshot('itinerary-cards-'+width);const hasTickets=await evaluate("!!document.querySelector('.booking-ticket-row')");if(hasTickets){await evaluate("document.querySelector('.booking-ticket-row').scrollIntoView({block:'center'})");await screenshot('booking-cards-'+width);}await evaluate('window.scrollTo(0,0)');}
  pass('Final itinerary uses data-driven icons and real completion indicators without overflow at desktop/tablet/mobile widths');
  const names=['Paris Skies','Bucharest Bound','Tokyo Bound','MADRID Days','Barca','Madrid'];
  for(const name of names)await api('/entities/Trip',{name,destination:name==='Paris Skies'?'Paris':'Rome',start_date:'2026-10-15',end_date:'2026-10-18'});
  await go('/?trips=1','Your Trips');
  for(const name of names)assert(await evaluate('document.body.innerText.includes('+JSON.stringify(name)+')'));
  assert(await evaluate("document.body.innerText.includes('Plan your journey with ease,')&&document.body.innerText.includes('all your travel data organized in one place.')"));
  pass('All six synthetic named trip folders and original heading/subtitle render');
  for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[820,1180],[390,844],[844,390]]){
    await browser.viewport(width,height);
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'cinematic overflow '+width);
    assert(await evaluate("(()=>{const v=document.querySelector('.cinematic-trips video'),r=v.getBoundingClientRect();return getComputedStyle(v).objectFit==='cover'&&Math.abs(r.width-document.documentElement.clientWidth)<2&&Math.abs(r.height-innerHeight)<2})()"));
    assert(await evaluate("(()=>{const r=document.querySelector('.cinematic-trips h3').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"),'card clipped '+width);
    await screenshot('restored-trips-'+width+'x'+height);
  }
  await browser.viewport(1440,900);await evaluate("document.querySelector('a[title=Home]').click()");await text('Your Trips');
  assert.equal(await evaluate('location.pathname'),'/');pass('Logo returns to Trips; fullscreen cover fits desktop, laptop, tablet and mobile orientations');
  const widths=[320,375,390,430,768,820,1024,1280,1440,1920];
  for(const [route,expected,label] of [['/?trips=1','Your Trips','trips'],[base,'Trip at a glance','overview'],[base+'/plan?step=0','Children','planner'],[base+'/itinerary','Itinerary','itinerary'],[base+'/wallet','Travel Wallet','wallet']]){
    await go(route,expected);
    for(const width of widths){
      await browser.viewport(width,width<600?900:1080);await new Promise(resolve=>setTimeout(resolve,180));
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),label+' overflow at '+width);
      if([390,1440].includes(width))await screenshot(label+'-'+width);
    }
    pass(label+' fits all ten requested widths from 320px to 1920px');
  }
  await go('/?trips=1','Your Trips');await evaluate("document.querySelector('button[aria-label=\"New Trip\"]').click()");await text('Where to next?');
  for(const width of widths){await browser.viewport(width,width<600?900:1080);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'modal overflow '+width);if(width===390)await screenshot('new-trip-mobile');}
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
  pass('New Trip modal fits all ten requested widths and closes with Escape');
  await pool.execute('UPDATE sessions SET mfa_verified_at=UTC_TIMESTAMP(3) WHERE user_id=?',[owner]);
  await browser.viewport(1440);await go('/admin/storage','Storage & CDN');await text('BUNNY_STORAGE_PASSWORD');await screenshot('admin-storage');assert(!await evaluate("[...document.querySelectorAll('input')].some(input=>input.value.includes('password='))"));pass('Admin Storage & CDN renders masked credential configuration');
  if(!(await api('/admin/bunny')).configured){await click('Test Connection');await input('[role=dialog] textarea','Verify missing local credentials');await input('[role=dialog] input','TEST');await click('Confirm action');await text('Bunny storage is not configured');await screenshot('admin-storage-error');pass('Admin connection failure is clearly displayed without configured credentials');}
  for(const [route,title] of [['/admin/storage','Bunny.net Setup'],['/admin/billing','Stripe Setup']]){
    await go(route,title);
    for(const width of [1440,390]){await browser.viewport(width,1000);await evaluate("document.querySelector('.integration-setup').scrollIntoView({block:'start'})");assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'));await screenshot('setup-'+route.split('/').at(-1)+'-'+width);}
    assert(await evaluate("document.querySelector('.setup-checklist').innerText.includes('Manual')"));
  }
  pass('Bunny and Stripe tutorials render responsive instructions and do not claim unverified payment/upload success');
  await go(base,'Trip at a glance');
  await evaluate("document.querySelector('.trip-wordmark p').textContent='A very long journey through Paris, Rome and the Mediterranean — an unforgettable holiday';window.scrollTo(0,0)");
  for(const width of [320,390,820,1440]){await browser.viewport(width,1000);assert(await evaluate("(()=>{const e=document.querySelector('.trip-wordmark'),r=e.getBoundingClientRect(),c=document.querySelector('.trip-navigation .trip-container').getBoundingClientRect();return Math.abs((r.left+r.right-c.left-c.right)/2)<2&&document.documentElement.scrollWidth<=innerWidth+2&&getComputedStyle(e.querySelector('p')).textOverflow==='ellipsis';})()"));await screenshot('trip-wordmark-'+width);}
  pass('Long trip wordmark remains centered and truncates at mobile, tablet and desktop widths');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await go(base,'Trip at a glance');assert.equal(await evaluate("getComputedStyle(document.querySelector('.trip-hero')).transitionDuration"),'0s');pass('Reduced motion preference respected');
  assert.deepEqual(browser.exceptions,[]);assert.deepEqual(responses,[]);assert.deepEqual(warnings,[]);pass('No uncaught browser exceptions, unexpected first-party HTTP failures or console warnings');
}catch(error){report.failures.push(error.message);if(browser){await browser.screenshot('failure').catch(()=>{});report.failureText=await browser.evaluate('document.body.innerText').catch(()=>null);}console.error(error);process.exitCode=1;}
finally{
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  await pool.query("DELETE FROM app_settings WHERE setting_key IN ('billing_enforcement_enabled','storage_provider')");
  for(const row of previous)await pool.execute('INSERT INTO app_settings(setting_key,value,version,updated_by,updated_at)VALUES(?,?,?,?,?)',[row.setting_key,typeof row.value==='string'?row.value:JSON.stringify(row.value),row.version,row.updated_by,row.updated_at]);
  const [testFiles]=await pool.execute('SELECT * FROM uploads WHERE owner_id=?',[owner]);const {deleteStoredFile}=await import('../server/storage/index.js');for(const file of testFiles)await deleteStoredFile(file);
  await pool.execute('DELETE FROM users WHERE id=?',[owner]);await pool.end();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
