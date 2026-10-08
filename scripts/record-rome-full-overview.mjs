// Runs only the real Vite UI with local, deterministic test/demo responses.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,copyFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'vite';
import {pool} from '../server/db.js';
import {config} from '../server/config.js';
import {loadRomeOverviewDemo} from './rome-overview-demo-fixture.mjs';
import {prepareRealRomeBook} from './rome-demo-real-book.mjs';

const out=path.resolve('.local/product-demos'),postersOnly=process.argv.includes('--posters-only');await mkdir(out,{recursive:true});
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(out,'playwright-tools');
const registry=JSON.parse(await readFile(new URL('../website/node_modules/playwright-core/browsers.json',import.meta.url),'utf8'));
const ffmpegDir=path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,'ffmpeg-'+registry.browsers.find(value=>value.name==='ffmpeg').revision);await mkdir(ffmpegDir,{recursive:true});await copyFile(process.env.FFMPEG_PATH||'C:/Tools/ffmpeg/bin/ffmpeg.exe',path.join(ffmpegDir,'ffmpeg-win64.exe'));
const {chromium,expect}=await import('../website/node_modules/@playwright/test/index.mjs');
const fixture=await loadRomeOverviewDemo(out),{trip,dates,items,essentials,wallet,weather,plan,document:travelDocument}=fixture;
const essentialsPdf=await readFile(path.join(out,'before-you-go-rome-demo.pdf'));
const browserKey=process.env.GOOGLE_MAPS_BROWSER_KEY?.trim()||'';
let includeMap=Boolean(browserKey)&&!process.argv.includes('--skip-google');
trip.share_enabled=true;trip.share_hide_stay=true;trip.plan_status='ready';
let realBook=null;try{realBook=await prepareRealRomeBook(fixture,out,chromium);}catch{console.log('Real Geoapify export unavailable; Full Book segment will be omitted.');}
const pdfBytes=realBook?.pdf||essentialsPdf,pdfName=realBook?'full-book':'essentials';
// Full Book is deliberately omitted until real imagery is available for this demo.
// Never read the old schematic PDF or substitute a provider fixture.
const width=1600,height=900,duration=33,errors=[],external=[],reads=[],posters=[];
const server=await createServer({optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,open:false},plugins:[{name:'local-product-demo-files',configureServer(vite){vite.middlewares.use((req,res,next)=>{const pdfFile=req.url?.startsWith('/__demo/'+pdfName+'.pdf'),guideFile=req.url?.startsWith('/__demo/essentials.pdf'),ticketFile=req.url?.startsWith('/__demo/travel-document.pdf');if(!pdfFile&&!guideFile&&!ticketFile)return next();res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline');res.end(guideFile?essentialsPdf:pdfFile?pdfBytes:travelDocument);});}}]});
await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port,itinerary=origin+'/trip/'+trip.id+'/itinerary';
const run=(exe,args)=>{const result=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout;};
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
const googleHosts=new Set(['maps.googleapis.com','maps.gstatic.com','maps.google.com','khms0.googleapis.com','khms1.googleapis.com','khms0.google.com','khms1.google.com']);
const googleRequests=[];
const googleErrorCodes=[];
try{const previous=JSON.parse(await readFile(path.join(out,'real-google-map-diagnostic.json'),'utf8'));if(!includeMap&&previous.errorCodes?.includes('RefererNotAllowedMapError'))googleErrorCodes.push('RefererNotAllowedMapError');}catch{}
let browser,context;let videoReport=null;
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
 context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block',...(!postersOnly?{recordVideo:{dir:path.join(out,'overview-recordings'),size:{width,height}}}:{})});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['http:','https:'].includes(url.protocol))return route.continue();
  if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
  if(url.hostname==='fast-imgs.b-cdn.net')return route.fulfill({status:204,body:''});
  if(url.origin!==origin){if(includeMap&&googleHosts.has(url.hostname)){googleRequests.push({host:url.hostname,path:url.pathname});return route.continue();}external.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  reads.push(url.pathname);if(url.pathname.includes('/itinerary/pdf/full')){assert(realBook);return route.fulfill({contentType:'application/pdf',body:realBook.pdf});}
  if(url.pathname.endsWith('/essentials/pdf'))return route.fulfill({contentType:'application/pdf',body:essentialsPdf});
  assert(request.method()==='GET'||url.pathname.includes('/meals/'),'Only local restaurant fixture POSTs are allowed');
  const data=responses(url.pathname);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.addInitScript(()=>{if(location.protocol==='http:'&&location.hostname==='127.0.0.1'&&window===window.top)localStorage.setItem('tripnexa.passport-country','US');});
 const page=await context.newPage(),recording=page.video();page.on('pageerror',()=>{errors.push('Browser script error');});
 page.on('console',message=>{const match=message.text().match(/Google Maps JavaScript API (?:error|warning): ([A-Za-z]+(?:Error|Warning))/);if(match&&!googleErrorCodes.includes(match[1]))googleErrorCodes.push(match[1]);});
 await page.goto(itinerary);await expect(page.locator('[data-before-you-go]')).toBeVisible();await expect(page.getByRole('button',{name:'View essentials',exact:true})).toBeEnabled();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(800);
 if(includeMap){
  await page.getByRole('button',{name:'Trip Map',exact:true}).click();
  try{await expect(page.locator('[data-map-state="ready"] .gm-style')).toBeVisible({timeout:15000});await page.waitForTimeout(1500);if(await page.locator('.gm-err-container').isVisible())includeMap=false;}
  catch{includeMap=false;}
  if(includeMap)await page.screenshot({path:path.join(out,'real-google-map-preflight.png')});
  await page.keyboard.press('Escape');
 }
 console.log(JSON.stringify({googleMapReady:includeMap,realGeoapifyBookReady:Boolean(realBook),newGeoapifyRequests:realBook?.newRequests||0}));
 if(process.argv.includes('--map-check-only')){await page.getByRole('button',{name:'Trip Map',exact:true}).click();await page.waitForTimeout(800);await page.screenshot({path:path.join(out,'real-google-map-diagnostic.png')});await writeFile(path.join(out,'real-google-map-diagnostic.json'),JSON.stringify({ready:includeMap,errorCodes:googleErrorCodes,requests:googleRequests.length},null,2));console.log(JSON.stringify({googleReady:includeMap,errorCodes:googleErrorCodes}));throw Object.assign(new Error('Map diagnostic complete'),{demoDiagnostic:true});}
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.evaluate(()=>{
  const pointer=document.createElement('div');pointer.id='demo-cursor';pointer.style.cssText='position:fixed;left:0;top:0;transform:translate(1330px,360px);width:28px;height:34px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 2px 3px #0006)';pointer.innerHTML='<svg width="28" height="34" viewBox="0 0 28 34"><path d="M3 2v25l6-6 5 10 5-2-5-10h10z" fill="white" stroke="#303432" stroke-width="1.3" stroke-linejoin="round"/></svg>';document.body.append(pointer);let x=1330,y=360;
  window.__demoMove=(nx,ny,duration)=>{const animation=pointer.animate([{transform:'translate('+x+'px,'+y+'px)'},{transform:'translate('+nx+'px,'+ny+'px)'}],{duration,easing:'cubic-bezier(.35,0,.2,1)',fill:'forwards'});x=nx;y=ny;return animation.finished;};
  window.__demoPulse=()=>{const ring=document.createElement('div');ring.style.cssText='position:fixed;left:'+(x-16)+'px;top:'+(y-16)+'px;width:34px;height:34px;border:2px solid #ed967d;background:#ffc7b055;border-radius:50%;pointer-events:none;z-index:2147483646';document.body.append(ring);ring.animate([{transform:'scale(.6)',opacity:1},{transform:'scale(1.9)',opacity:0}],{duration:440,easing:'ease-out'}).finished.then(()=>ring.remove());};
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){click.call(this);if(!this.download)return;setTimeout(()=>{const viewer=document.createElement('iframe');viewer.id='demo-pdf-preview';viewer.title='TripNexa PDF';viewer.src='/__demo/'+window.__demoPdfName+'.pdf#page=1&zoom=90';viewer.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;background:#292929;z-index:2147483640';document.body.append(viewer);},70);};
 });
 const click=async(locator,ms=350)=>{await expect(locator).toBeVisible();const rect=await locator.boundingBox();assert(rect);const x=rect.x+rect.width*.5,y=rect.y+rect.height*.5;await page.evaluate(({x,y,ms})=>window.__demoMove(x,y,ms),{x,y,ms});await page.mouse.move(x,y);await page.evaluate(()=>window.__demoPulse());await page.mouse.click(x,y);};
 const scroll=async(target,ms=500,modal=false)=>page.evaluate(({target,ms,modal})=>new Promise(resolve=>{const element=modal?document.querySelector('.premium-trip-dialog'):document.scrollingElement;const from=element.scrollTop,start=performance.now();function tick(now){const t=Math.min(1,(now-start)/ms),ease=t<.5?2*t*t:1-((-2*t+2)**2)/2;element.scrollTop=from+(target-from)*ease;if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);}),{target,ms,modal});
 const close=async()=>{await click(page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).first(),220);await expect(page.getByRole('dialog')).toHaveCount(0);};
 const nav=label=>page.locator('nav[aria-label="Trip navigation"]').getByRole('link',{name:label,exact:true});
 const shot=async(name,locator=null)=>{
  await page.evaluate(()=>{const cursor=document.querySelector('#demo-cursor');if(cursor)cursor.style.visibility='hidden';});await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const filename='feature-'+name+'.png';await page.screenshot({path:path.join(out,filename),animations:'disabled'});posters.push(filename);
  if(locator){await locator.screenshot({path:path.join(out,'feature-'+name+'-crop.png'),animations:'disabled'});posters.push('feature-'+name+'-crop.png');}
  await page.evaluate(()=>{const cursor=document.querySelector('#demo-cursor');if(cursor)cursor.style.visibility='visible';});
 };
 await page.evaluate(name=>{window.__demoPdfName=name;},pdfName);
 const showPdfPage=async(number)=>{await page.locator('#demo-pdf-preview').evaluate((frame,number)=>{frame.src='/__demo/'+window.__demoPdfName+'.pdf?preview-page='+number+'#page='+number+'&zoom=90';},number);await page.waitForTimeout(650);};
 if(!postersOnly){
  // A pre-roll marker locates the exact recording start; it is removed before the final video.
  await page.evaluate(()=>{const marker=document.createElement('div');marker.id='demo-preroll';marker.style.cssText='position:fixed;left:0;top:0;width:16px;height:16px;background:#00ff00;z-index:2147483647';document.body.append(marker);});
  await page.waitForTimeout(240);await page.locator('#demo-preroll').evaluate(marker=>marker.remove());
  const start=performance.now(),at=async ms=>{const delay=start+ms-performance.now();if(delay>0)await new Promise(resolve=>setTimeout(resolve,delay));};
  const focus=async(selector,offset=260,ms=650)=>{const target=await page.locator(selector).evaluate((el,offset)=>scrollY+el.getBoundingClientRect().top-offset,offset);await scroll(target,ms);};
  await at(1100);await scroll(400,1250);
  await at(3100);await focus('#map-itinerary-monti');await click(page.locator('#map-itinerary-monti').getByRole('button',{name:'Change restaurant'}),320);await expect(page.locator('[data-restaurant-card]')).toHaveCount(2);
  await at(4900);await click(page.locator('[data-restaurant-card]').first().getByRole('button',{name:'Choose for this meal'}),350);await expect(page.getByRole('dialog')).toHaveCount(0);
  await at(5700);await focus('#map-itinerary-colosseum');await click(page.locator('#map-itinerary-colosseum').getByRole('button',{name:'Find another option'}),300);await expect(page.getByRole('dialog').getByRole('heading',{name:'GetYourGuide',exact:true})).toBeVisible();
  await at(7500);await close();await scroll(0,300);await click(page.getByRole('button',{name:'Day 3 · 18 Oct',exact:true}),280);await focus('[data-before-you-go]',470,600);await click(page.getByRole('button',{name:'View essentials',exact:true}),320);await expect(page.locator('.passport-country select')).toHaveValue('US');
  await at(10800);await scroll(350,1000,true);await at(12400);await scroll(780,1000,true);await at(14000);await scroll(1250,1000,true);await at(15400);await scroll(1750,1000,true);
  await at(17200);await close();await scroll(0,400);
  if(includeMap){await click(page.getByRole('button',{name:'Trip Map',exact:true}),320);await expect(page.locator('[data-map-state="ready"] .gm-style')).toBeVisible();await at(19000);await click(page.getByRole('dialog').getByRole('button',{name:'Day 2',exact:true}),350);await at(20200);await click(page.locator('.trip-map-marker').first(),380);await expect(page.locator('.trip-map-stop[aria-pressed="true"]')).toHaveCount(1);await at(21700);await close();}
  else{await click(page.getByRole('button',{name:'Trip Weather',exact:true}),320);await expect(page.locator('.weather-overview-day')).toHaveCount(3);await at(19700);await click(page.getByRole('button',{name:'Fahrenheit',exact:true}),350);await at(21500);await close();}
  await at(22200);
  if(realBook){await click(page.getByRole('button',{name:'Download Trip',exact:true}),320);await click(page.getByRole('button',{name:'Download Full Travel Book',exact:true}),360);}
  else{await focus('[data-before-you-go]',470,350);await click(page.getByRole('button',{name:'View essentials',exact:true}),280);await scroll(10000,400,true);await click(page.getByRole('button',{name:'Download Essentials PDF',exact:true}),300);}
  await expect(page.locator('#demo-pdf-preview')).toBeVisible();await at(24300);await showPdfPage(2);
  await at(26700);await page.locator('#demo-pdf-preview').evaluate(frame=>frame.remove());await page.keyboard.press('Escape');await scroll(0,300);await click(page.getByRole('button',{name:'Share',exact:true}),320);await expect(page.getByRole('dialog').getByRole('heading',{name:'Share trip',exact:true})).toBeVisible();
  await at(29500);await close();await click(page.getByRole('link',{name:'Trips',exact:true}),450);await expect(page.getByRole('heading',{name:'Where to next?'})).toBeVisible();await at(duration*1000);await page.screenshot({path:path.join(out,'full-overview-ending.png')});assert((await stat(path.join(out,'full-overview-ending.png'))).size>40000);
  assert(performance.now()-start<35000,'The overview must not contain long loading waits');await page.close();const raw=await recording.path();await context.close();context=null;
  const rawInfo=probe(raw),rawFps=Number(rawInfo.streams[0].r_frame_rate.split('/')[0])/Number(rawInfo.streams[0].r_frame_rate.split('/')[1]);
  const samples=spawnSync('ffmpeg',['-v','error','-i',raw,'-vf','crop=8:8:0:0,scale=1:1,format=rgb24','-f','rawvideo','-'],{windowsHide:true,maxBuffer:1024*1024});assert.equal(samples.status,0);let lastMarker=-1;
  for(let i=0;i<samples.stdout.length;i+=3)if(samples.stdout[i]<35&&samples.stdout[i+1]>220&&samples.stdout[i+2]<35)lastMarker=i/3;
  assert(lastMarker>=0,'Recording pre-roll marker must be found');const trimStart=(lastMarker+1)/rawFps;
  const mp4=path.join(out,'tripnexa-rome-full-overview.mp4');run('ffmpeg',['-y','-i',raw,'-ss',String(trimStart),'-t',String(duration),'-an','-vf','fps=30,scale=1600:900:flags=lanczos','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',mp4]);
  run('ffmpeg',['-y','-ss','1.0','-i',mp4,'-frames:v','1','-q:v','2',path.join(out,'tripnexa-rome-full-overview-poster.jpg')]);
  const info=probe(mp4),stream=info.streams.find(value=>value.codec_type==='video');assert.equal(stream.codec_name,'h264');assert.equal(stream.width,width);assert.equal(stream.height,height);assert(!info.streams.some(value=>value.codec_type==='audio'));assert(Number(info.format.duration)>=28&&Number(info.format.duration)<=35);run('ffmpeg',['-v','error','-i',mp4,'-f','null','-']);const bytes=await readFile(mp4);assert(bytes.indexOf(Buffer.from('moov'))<bytes.indexOf(Buffer.from('mdat')));
  videoReport={filename:path.basename(mp4),duration:Number(info.format.duration),resolution:width+'x'+height,bytes:(await stat(mp4)).size};
  // Capture posters in a fresh unrecorded context, retaining the same offline routes.
  context=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(!['http:','https:'].includes(url.protocol))return route.continue();if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});if(url.hostname==='fast-imgs.b-cdn.net')return route.fulfill({status:204,body:''});if(url.origin!==origin){if(includeMap&&googleHosts.has(url.hostname)){googleRequests.push({host:url.hostname,path:url.pathname});return route.continue();}external.push(url.origin);return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();assert(route.request().method()==='GET'||url.pathname.includes('/meals/'));const response=responses(url.pathname);return route.fulfill({contentType:'application/json',body:JSON.stringify(response)});});
  await context.addInitScript(()=>{if(location.protocol==='http:'&&window===window.top)localStorage.setItem('tripnexa.passport-country','US');});
 }
 // The same actual components are captured independently, with no cursor/debug overlays.
 const postersPage=postersOnly?page:await context.newPage();if(!postersOnly)postersPage.on('pageerror',()=>errors.push('Browser script error'));
 async function capture(name,crop=null){await postersPage.waitForTimeout(450);assert.equal(await postersPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const file='feature-'+name+'.png';await postersPage.screenshot({path:path.join(out,file),animations:'disabled'});posters.push(file);if(crop){await crop.screenshot({path:path.join(out,'feature-'+name+'-crop.png'),animations:'disabled'});posters.push('feature-'+name+'-crop.png');}}
 await postersPage.goto(origin+'/trip/'+trip.id+'/itinerary');await expect(postersPage.locator('[data-itinerary-day]')).toHaveCount(3);await postersPage.evaluate(()=>window.scrollTo(0,250));await capture('itinerary-overview');
 await postersPage.locator('#map-itinerary-monti').getByRole('button',{name:'Change restaurant'}).click();await expect(postersPage.locator('[data-restaurant-card]')).toHaveCount(2);await capture('meal-options',postersPage.getByRole('dialog'));await postersPage.keyboard.press('Escape');
 await postersPage.locator('#map-itinerary-colosseum').getByRole('button',{name:'Find another option'}).click();await expect(postersPage.getByRole('dialog').getByRole('heading',{name:'GetYourGuide',exact:true})).toBeVisible();await capture('tickets',postersPage.getByRole('dialog'));await postersPage.keyboard.press('Escape');
 await postersPage.goto(itinerary);await expect(postersPage.getByRole('button',{name:'View essentials',exact:true})).toBeEnabled();await postersPage.getByRole('button',{name:'View essentials',exact:true}).click();await expect(postersPage.locator('.essentials-sections details')).toHaveCount(10);await capture('before-you-go',postersPage.locator('.premium-trip-dialog'));await postersPage.keyboard.press('Escape');
 await postersPage.evaluate(()=>window.scrollTo(0,0));await postersPage.getByRole('button',{name:'Trip Weather',exact:true}).click();await expect(postersPage.locator('.weather-overview-day')).toHaveCount(3);await capture('weather',postersPage.locator('.trip-weather-dialog'));await postersPage.keyboard.press('Escape');
 if(includeMap){await postersPage.getByRole('button',{name:'Trip Map',exact:true}).click();await expect(postersPage.locator('[data-map-state="ready"] .gm-style')).toBeVisible();await postersPage.waitForTimeout(1500);assert.equal(await postersPage.locator('.gm-err-container').count(),0);await postersPage.locator('.trip-map-marker').first().click();await capture('trip-map',postersPage.locator('.trip-map-dialog'));await postersPage.keyboard.press('Escape');}
 await postersPage.goto(origin+'/trip/'+trip.id+'/wallet?category=place&item=rome-colosseum-ticket');await expect(postersPage.locator('[data-wallet-file]')).toBeVisible();await capture('travel-wallet',postersPage.locator('[data-wallet-item-detail]'));
 await postersPage.goto(origin+'/__demo/essentials.pdf#page=1&zoom=95');await postersPage.waitForTimeout(1000);await capture('essentials-pdf');
 if(realBook){await postersPage.goto(origin+'/__demo/full-book.pdf?poster-page=2#page=2&zoom=95');await postersPage.waitForTimeout(1000);await capture('full-travel-book');await postersPage.goto(origin+'/__demo/full-book.pdf?poster-page=1#page=1&zoom=95');await postersPage.waitForTimeout(700);await capture('full-travel-book-cover');}
 await postersPage.goto(itinerary);await postersPage.getByRole('button',{name:'Share',exact:true}).click();await expect(postersPage.getByRole('dialog').locator('input[readonly]')).toHaveValue('https://tripnexa.app/shared/rome-travel-guide');await capture('share-trip',postersPage.getByRole('dialog'));await postersPage.keyboard.press('Escape');await postersPage.getByRole('link',{name:'Trips',exact:true}).click();await expect(postersPage.getByRole('heading',{name:'Where to next?'})).toBeVisible();await capture('trips-overview');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 // Browser decode/playback of the final local MP4, with no network media requests.
 if(videoReport){const check=await context.newPage(),bytes=await readFile(path.join(out,videoReport.filename));await check.setContent('<video muted style="width:100%"></video>');await check.locator('video').evaluate(async(video,base64)=>{const binary=atob(base64),buffer=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)buffer[i]=binary.charCodeAt(i);video.src=URL.createObjectURL(new Blob([buffer],{type:'video/mp4'}));await video.play();},bytes.toString('base64'));await check.waitForTimeout(350);const playback=await check.locator('video').evaluate(video=>({time:video.currentTime,error:video.error,width:video.videoWidth,height:video.videoHeight}));assert(playback.time>0&&!playback.error);assert.equal(playback.width,width);assert.equal(playback.height,height);videoReport.browserPlayback=true;}
 let geoapifyTotal=0;try{geoapifyTotal=JSON.parse(await readFile(path.join(out,'real-geoapify','report.json'),'utf8')).newGeoapifyRequests||0;}catch{}
 const report={video:videoReport,posters,preparedTrip:trip.id,reused:['Rome trip/itinerary fixture','Saved US/Rome Essentials v5 snapshot','Saved Essentials PDF','Previously prepared 22°C/13°C typical seasonal weather','Prepared Wallet documents'],map:includeMap?'Real Google Maps integration and tiles':'Segment and poster omitted: supplied Google key returned RefererNotAllowedMapError for local recording origin',googleErrorCodes,fullBook:realBook?'Real renderer; three geographic day maps; Geoapify master image and geographically aligned crops':'Segment and poster omitted: real Geoapify image unavailable',pdfShown:realBook?'Real Full Travel Book':'Saved standalone Essentials PDF',googleRequestsThisRun:googleRequests.length,geoapifyRequestsThisRun:realBook?.newRequests||0,geoapifyRequestsTotal:geoapifyTotal,geoapifyCacheReused:realBook?.cacheReused||false,openAiRequests:0,weatherProviderRequests:0,externalApiCallsThisRun:googleRequests.length+(realBook?.newRequests||0),backendCalls:0,mysqlConnections:0,errors,videoCommand:'node scripts/record-rome-full-overview.mjs',posterCommand:'node scripts/record-rome-full-overview.mjs --posters-only'};
 await writeFile(path.join(out,postersOnly?'rome-full-overview-posters-report.json':'rome-full-overview-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 function responses(p){
 if(p==='/api/auth/me')return {id:'demo-account',full_name:'Traveler',email_verified:true};
 if(p==='/api/config')return {googleConfigured:false,billingEnabled:false};
 if(p==='/api/public-settings')return {branding:{app_name:'TripNexa'}};
 if(p.includes('/billing/'))return {premium:true};
 if(p==='/api/entities/Trip')return [trip];
 if(p==='/api/entities/TripItem')return fixture.state.tripItems;
 if(p==='/api/entities/Trip/'+trip.id)return trip;
 if(p.endsWith('/share-url'))return {url:'https://tripnexa.app/shared/rome-travel-guide'};
 if(p.includes('/meals/')&&p.endsWith('/options'))return {token:'local-selection',notice:'Opening hours and availability can change.',context:{anchor:{name:'Colosseum & Roman Forum'}},restaurants:[{place_id:'rome-monti',name:'La Taverna dei Fori Imperiali',category:'Italian',price_label:'Mid-range',distance_m:450,address:'Via della Madonna dei Monti, Rome',maps_url:'https://www.google.com/maps/search/?api=1&query=La+Taverna+dei+Fori+Imperiali+Rome'},{place_id:'rome-monti-alternative',name:'Ai Tre Scalini',category:'Roman / Italian',price_label:'Mid-range',distance_m:600,address:'Via Panisperna, Rome',maps_url:'https://www.google.com/maps/search/?api=1&query=Ai+Tre+Scalini+Rome'}]};
 if(p.includes('/meals/')&&p.endsWith('/choice'))return plan;
 if(p.includes('/photos'))return {photos:[]};
 if(p.endsWith('/itinerary'))return plan;
 if(p.endsWith('/wallet'))return {items:wallet};
 if(p==='/api/entities/PlaceSelection')return [];
 if(p.includes('/tickets/'))return {providers:[{provider:'getyourguide',name:'GetYourGuide',description:'Explore tickets and guided visits',url:'https://www.getyourguide.com/rome-l33/'},{provider:'tiqets',name:'Tiqets',description:'Discover attraction tickets',url:'https://www.tiqets.com/en/rome-attractions-c71631/'}],ticketable:true,context:{name:'Colosseum & Roman Forum',city:'Rome',country:'Italy'},booking:{booked:true,saved:true,wallet_item_id:'rome-colosseum-ticket',provider:'other'},disclosure:'Some links are affiliate links. Booking and payment take place on the provider website.'};
 if(p.endsWith('/weather'))return {days:weather};
 if(p.endsWith('/interactive-map'))return {provider:'google',configured:includeMap,browserKey:includeMap?browserKey:''};
 if(p.endsWith('/essentials'))return {...essentials,updates:{remaining:1,blocked:false,serverTime:'2026-10-07T12:00:00Z'}};
 throw Error('Missing prepared demo response: '+p);
 }
}catch(error){if(!error.demoDiagnostic)throw error;}finally{await context?.close();await browser?.close();await server.close();await pool.end();}
