// Offline product recording: real app, intercepted test responses, no backend/DB/API.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,stat,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createServer} from 'vite';
import {essentialsContext,emptyEssentials} from '../server/premium-travel/essentials.js';
import {printableEssentials,essentialsPdfHtml,renderEssentialsPdf} from '../server/premium-travel/essentials-pdf.js';
import {pool} from '../server/db.js';

const out=path.resolve('.local/product-demos');await mkdir(out,{recursive:true});
// Reuse the installed system FFmpeg offline; never download a recorder dependency.
process.env.PLAYWRIGHT_BROWSERS_PATH=path.join(out,'playwright-tools');
const browsers=JSON.parse(await readFile(new URL('../website/node_modules/playwright-core/browsers.json',import.meta.url),'utf8'));
const recorderDir=path.join(process.env.PLAYWRIGHT_BROWSERS_PATH,'ffmpeg-'+browsers.browsers.find(item=>item.name==='ffmpeg').revision);await mkdir(recorderDir,{recursive:true});
await copyFile(process.env.FFMPEG_PATH||'C:/Tools/ffmpeg/bin/ffmpeg.exe',path.join(recorderDir,'ffmpeg-win64.exe'));
const {chromium,expect}=await import('../website/node_modules/@playwright/test/index.mjs');
const width=1440,height=810,duration=12.4;
const trip={id:'rome-travel-brief',name:'3 days in Rome',destination:'Rome',destination_city:'Rome',country:'Italy',currency:'EUR',timezone:'Europe/Rome',origin_country:'United States',origin_timezone:'America/New_York',start_date:'2026-10-16',end_date:'2026-10-18',travel_type:'plane',status:'ready'};
const dates=['2026-10-16','2026-10-17','2026-10-18'];
const make=(id,date,title,type,start,end,extra={})=>({id,trip_id:trip.id,date,title,step_type:type,start_time:start,end_time:end,...extra});
const items=[
 make('colosseum',dates[0],'Colosseum & Roman Forum','visit','10:00','12:30',{location:'Piazza del Colosseo',lat:41.8902,lng:12.4922,ticket_status:'purchased'}),
 make('monti',dates[0],'Lunch in Monti','meal','13:00','14:00',{location:'Monti'}),
 make('pantheon',dates[1],'Pantheon & Piazza Navona','visit','10:00','12:00',{location:'Piazza della Rotonda',lat:41.8986,lng:12.4769,ticket_status:'purchased'}),
 make('vatican',dates[1],'Vatican Museums','visit','14:00','16:30',{location:'Viale Vaticano',lat:41.9065,lng:12.4536,ticket_status:'purchased'}),
 make('trastevere',dates[2],'A morning in Trastevere','visit','09:00','11:00',{location:'Piazza di Santa Maria',lat:41.8895,lng:12.4709,ticket_status:'free'}),
 make('lunch',dates[2],'Lunch by the Tiber','meal','12:00','13:00',{location:'Trastevere'}),
 make('transfer',dates[2],'Transfer to Fiumicino Airport','transport','15:00','15:45',{route_origin:'Roma Termini',route_destination:'Fiumicino Airport',route_mode:'transit',route_duration_min:45,location:'Roma Termini'}),
 make('departure',dates[2],'Departure · Fiumicino Airport','departure','17:30','19:30',{location:'Fiumicino Airport'})
];
const state={ownerId:'demo-account',trip,tripItems:[],places:[],items};
const snapshot=emptyEssentials(essentialsContext(state,'US'));
snapshot.generatedAt='2026-10-07T12:00:00.000Z';snapshot.guideVersion=5;snapshot.generation.current=true;
const country=snapshot.countries[0];
const fact=(text,field)=>({text,...(field?{field}:{}),sourceType:'ai_general',sourceUrl:null,verifiedAt:null,checkedAt:null});
const contents={
 money:[fact('Italy uses the euro (EUR, €).','currency'),fact('Cards work in most Rome restaurants and shops; keep some euros for small purchases.','payments'),fact('Bank ATMs dispense euros. Choose EUR rather than a conversion into USD.','atms')],
 power:[fact('Rome uses Type C, F and L plugs, 230V electricity and 50Hz.','specifications'),fact('US plugs need an adapter. Chargers marked 100–240V work with an adapter; 120V-only appliances need a suitable converter.','compatibility')],
 connectivity:[fact('Visitor eSIMs, Italian prepaid SIMs and hotel Wi-Fi are practical options in Rome.','options'),fact('Install an eSIM on an unlocked compatible phone before departure; activate its data plan on arrival.','activation'),fact('For three days, a small data eSIM is convenient for maps and messages. Keep your US number for calls when needed.','recommendation')],
 transport:[fact('ATAC buses, trams and Metro lines A, B and C connect Rome. Leonardo Express links Fiumicino with Roma Termini.','systems'),fact('Use an ATAC ticket or the supported contactless tap-and-go system; validate paper tickets before travel.','payment'),fact('Walk between the Pantheon and Piazza Navona. Use Metro A for the Vatican and Metro B for the Colosseum.','recommendations')],
 customs:[fact('A tip is optional in Rome restaurants; rounding up or leaving a small amount is appreciated.'),fact('Round up a taxi fare when you want to thank the driver.'),fact('Greet shop staff with “Buongiorno” and say “Grazie” when leaving.'),fact('In churches, cover shoulders and knees and speak quietly.'),fact('A coffee at the bar often costs less than table service.'),fact('A restaurant service charge may appear separately on the bill.')],
 phrases:[['Buongiorno','Hello / good morning'],['Grazie','Thank you'],['Per favore','Please'],['Il conto, per favore','The bill, please'],['Dov’è la metro?','Where is the metro?']].map(([localScript,meaning])=>({...fact(localScript+' — '+meaning),localScript,romanization:null,meaning})),
 critical:[fact('Rome’s historic center is best explored in comfortable shoes; cobblestones make long walks slower.')]
};
for(const section of country.sections)if(contents[section.key])section.facts=contents[section.key];
const saved=printableEssentials(snapshot);assert.equal(saved.generation.status,'complete');assert.equal(saved.countries[0].sections.filter(section=>section.facts.length||['entryDocuments','emergency'].includes(section.key)).length,10);
assert(!saved.countries[0].sections.flatMap(section=>section.facts).some(fact=>fact.sourceType==='official'||fact.verifiedAt));
await writeFile(path.join(out,'rome-demo-snapshot.json'),JSON.stringify(saved,null,2));
const pdf=await renderEssentialsPdf(trip,saved);await writeFile(path.join(out,'before-you-go-rome-demo.pdf'),pdf);
const html=essentialsPdfHtml(trip,saved);await writeFile(path.join(out,'before-you-go-rome-demo.html'),html);
const pdfPages=(pdf.toString('latin1').match(/\/Type \/Page\b/g)||[]).length;assert(pdfPages>=1&&pdfPages<=4);

const server=await createServer({optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,open:false},plugins:[{name:'offline-product-demo-pdf',configureServer(vite){vite.middlewares.use((req,res,next)=>{if(!req.url?.startsWith('/__demo/rome-essentials.pdf'))return next();res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition','inline; filename="TripNexa-Before-You-Go.pdf"');res.end(pdf);});}}]});
await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
let browser,context,rawVideo;const errors=[],external=[],offlineAssets=[],fixtureReads=[];let pdfClicks=0;
const command=(exe,args)=>{const result=spawnSync(exe,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout;};
const probe=file=>JSON.parse(command('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file]));
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking']});
 context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,recordVideo:{dir:path.join(out,'recordings'),size:{width,height}},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['http:','https:'].includes(url.protocol))return route.continue(); // Chrome's local PDF-viewer resources.
  if(url.hostname==='fonts.googleapis.com'){offlineAssets.push('Google Fonts stylesheet fulfilled offline');return route.fulfill({contentType:'text/css',body:''});}
  if(url.origin!==origin){external.push(url.origin);return route.abort();}
  if(!url.pathname.startsWith('/api/'))return route.continue();
  assert.equal(request.method(),'GET','The prepared demo must not perform updates');fixtureReads.push(url.pathname);
  let data;
  if(url.pathname==='/api/auth/me')data={id:'demo-account',full_name:'Traveler',email_verified:true};
  else if(url.pathname==='/api/config')data={googleConfigured:false,billingEnabled:false};
  else if(url.pathname==='/api/public-settings')data={branding:{app_name:'TripNexa'}};
  else if(url.pathname.includes('/billing/'))data={premium:true};
  else if(url.pathname==='/api/entities/Trip/'+trip.id)data=trip;
  else if(url.pathname==='/api/trips/'+trip.id+'/itinerary')data={version:1,status:'ready',dates,items,warnings:[],validation:{warnings:[]}};
  else if(url.pathname.endsWith('/wallet'))data={items:[]};
  else if(url.pathname==='/api/entities/PlaceSelection')data=[];
  else if(url.pathname.includes('/tickets/'))data={providers:[],ticketable:true,context:{name:'Rome attraction',city:'Rome',country:'Italy'},booking:{booked:true,provider:'other'},walletItem:null};
  else if(url.pathname.endsWith('/weather'))data={days:dates.map(date=>({date,locationLabel:'Rome, Italy',kind:'typical',symbol:'sun',temperature:{highC:22,lowC:13},climatePeriod:'October'}))};
  else if(url.pathname.endsWith('/essentials/pdf')){pdfClicks++;return route.fulfill({contentType:'application/pdf',body:pdf});}
  else if(url.pathname.endsWith('/essentials'))data={...saved,updates:{tripLimit:2,userLimit:20,remaining:1,tripRemaining:1,userRemaining:19,blocked:false,nextAllowedAt:null,serverTime:'2026-10-07T12:00:00Z'}};
  else throw Error('Unprepared demo route: '+url.pathname);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.addInitScript(()=>{if(location.protocol==='http:'&&location.hostname==='127.0.0.1'&&window===window.top)localStorage.setItem('tripnexa.passport-country','US');});
 const page=await context.newPage();rawVideo=page.video();page.on('pageerror',error=>{errors.push(error.message);console.error('Demo browser:',error.message);});
 await page.goto(origin+'/trip/'+trip.id+'/itinerary');const teaser=page.locator('[data-before-you-go]');await expect(teaser).toBeVisible();await expect(page.getByRole('button',{name:'View essentials',exact:true})).toBeEnabled();
 await page.evaluate(()=>{const card=document.querySelector('[data-before-you-go]');window.scrollTo(0,window.scrollY+card.getBoundingClientRect().top-510);});
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForTimeout(1000); // Let the real itinerary entrance animation settle before recording.
 await page.evaluate(()=>{
  const cursor=document.createElement('div');cursor.id='demo-cursor';cursor.style.cssText='position:fixed;left:0;top:0;width:27px;height:33px;pointer-events:none;z-index:2147483647;filter:drop-shadow(0 2px 3px #0006);transform:translate(1040px,410px)';cursor.innerHTML='<svg width="27" height="33" viewBox="0 0 27 33"><path d="M3 2v25l6-6 5 10 5-2-5-10h10z" fill="white" stroke="#303432" stroke-width="1.3" stroke-linejoin="round"/></svg>';document.body.append(cursor);
  let x=1040,y=410;
  window.__demoMove=(nx,ny,ms)=>{const animation=cursor.animate([{transform:'translate('+x+'px,'+y+'px)'},{transform:'translate('+nx+'px,'+ny+'px)'}],{duration:ms,easing:'cubic-bezier(.35,0,.2,1)',fill:'forwards'});x=nx;y=ny;return animation.finished;};
  window.__demoPulse=()=>{const ring=document.createElement('div');ring.style.cssText='position:fixed;left:'+(x-18)+'px;top:'+(y-18)+'px;width:38px;height:38px;border:2px solid #ed967d;background:#ffc7b055;border-radius:50%;pointer-events:none;z-index:2147483646';document.body.append(ring);ring.animate([{transform:'scale(.5)',opacity:.9},{transform:'scale(1.8)',opacity:0}],{duration:500,easing:'ease-out'}).finished.then(()=>ring.remove());};
  // Demo-only preview adapter: keep the real download handler and display its real PDF.
  const anchorClick=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){anchorClick.call(this);if(!this.download)return;setTimeout(()=>{const frame=document.createElement('iframe');frame.id='demo-pdf-preview';frame.title='TripNexa Before You Go PDF';frame.src='/__demo/rome-essentials.pdf#zoom=100';frame.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0;background:#303030;z-index:2147483640';document.body.append(frame);},100);};
 });
 const noOverflow=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert(noOverflow);
 await page.screenshot({path:path.join(out,'scene-itinerary.png')});
 const begin=performance.now(),at=async ms=>{const wait=begin+ms-performance.now();if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));};
 const move=async(locator,ms)=>{const box=await locator.boundingBox();assert(box);const x=box.x+box.width*.52,y=box.y+box.height*.5;await page.evaluate(({x,y,ms})=>window.__demoMove(x,y,ms),{x,y,ms});await page.mouse.move(x,y);};
 const pulse=()=>page.evaluate(()=>window.__demoPulse());
 const smoothScroll=async(target,duration)=>page.evaluate(({target,duration})=>new Promise(resolve=>{const element=document.querySelector('.premium-trip-dialog'),from=element.scrollTop,start=performance.now();const loop=now=>{const t=Math.min(1,(now-start)/duration),ease=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;element.scrollTop=from+(target-from)*ease;if(t<1)requestAnimationFrame(loop);else resolve();};requestAnimationFrame(loop);}),{target,duration});
 await at(1000);const view=page.getByRole('button',{name:'View essentials',exact:true});await move(view,1000);await at(2200);await pulse();await page.mouse.click((await view.boundingBox()).x+(await view.boundingBox()).width*.52,(await view.boundingBox()).y+(await view.boundingBox()).height*.5);
 await expect(page.locator('.passport-country select')).toHaveValue('US');await expect(page.locator('.essentials-sections details')).toHaveCount(10);
 assert.equal(await page.locator('.essentials-verified').count(),0);assert.equal(await page.locator('.premium-trip-dialog').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 await at(3300);await page.screenshot({path:path.join(out,'scene-guide.png')});
 await at(4200);await page.evaluate(()=>window.__demoMove(1020,475,500));
 const scroll=await page.locator('.premium-trip-dialog').evaluate(el=>({max:el.scrollHeight-el.clientHeight,power:document.querySelectorAll('.essentials-sections details')[2].offsetTop-80,transport:document.querySelectorAll('.essentials-sections details')[5].offsetTop-70}));
 await smoothScroll(scroll.power,700);await at(5300);await smoothScroll(scroll.transport,850);await at(6600);await smoothScroll(Math.max(scroll.transport,scroll.max-230),1100);await at(8200);await page.screenshot({path:path.join(out,'scene-customs.png')});
 await at(8500);await smoothScroll(scroll.max,550);const download=page.getByRole('button',{name:'Download Essentials PDF',exact:true});await move(download,800);await at(10000);await pulse();await download.click();
 await expect(page.locator('#demo-pdf-preview')).toBeVisible();await at(11500);await page.screenshot({path:path.join(out,'scene-pdf.png')});assert((await stat(path.join(out,'scene-pdf.png'))).size>40000,'The native viewer must show rendered PDF content');await at(duration*1000);
 assert.equal(pdfClicks,1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await page.close();const raw=await rawVideo.path();await context.close();context=null;
 const rawInfo=probe(raw),rawDuration=Number(rawInfo.format.duration),mp4=path.join(out,'before-you-go-rome-demo.mp4');
 // Cut setup frames; keep the deliberately timed final 12.4-second recording.
 command('ffmpeg',['-y','-i',raw,'-ss',String(Math.max(0,rawDuration-duration)),'-t',String(duration),'-an','-vf','fps=30,scale=1440:810:flags=lanczos','-c:v','libx264','-preset','slow','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',mp4]);
 const poster=path.join(out,'before-you-go-rome-demo-poster.jpg');command('ffmpeg',['-y','-ss','3.65','-i',mp4,'-frames:v','1','-q:v','2',poster]);
 const final=probe(mp4),video=final.streams.find(stream=>stream.codec_type==='video');assert.equal(video.codec_name,'h264');assert.equal(video.width,width);assert.equal(video.height,height);assert(!final.streams.some(stream=>stream.codec_type==='audio'));assert(Number(final.format.duration)>=10&&Number(final.format.duration)<=14);
 command('ffmpeg',['-v','error','-i',mp4,'-f','null','-']);
 const bytes=await readFile(mp4);assert(bytes.indexOf(Buffer.from('moov'))<bytes.indexOf(Buffer.from('mdat')),'faststart metadata');
 const report={filename:mp4,duration:Number(final.format.duration),resolution:width+'x'+height,bytes:(await stat(mp4)).size,poster,pdfPages,externalApiCalls:0,backendApiCalls:0,databaseConnections:0,mockedLocalReads:fixtureReads,pdfClicks,browserErrors:errors,technology:'Real Vite React app + Playwright Chrome video recording + native Chrome PDF viewer + FFmpeg H.264',regenerate:'node scripts/record-before-you-go-demo.mjs'};
 await writeFile(path.join(out,'before-you-go-rome-demo-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await context?.close();await browser?.close();await server.close();await pool.end();}
