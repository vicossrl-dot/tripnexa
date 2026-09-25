// Explicit live-provider verification on an isolated test database. No existing user is changed.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,writeFile,readdir,readFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import {openBrowser} from './browser-driver.mjs';
const live=process.argv.includes('--live');assert(live||process.argv.includes('--local'),'Pass --local for fixtures or --live for real providers.');
assert(/_test$/.test(process.env.MYSQL_TEST_DATABASE||''),'Use a separate MYSQL_TEST_DATABASE ending in _test.');
process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE;process.env.NODE_ENV='test';process.env.GOOGLE_ROUTES_ENABLED='true';
const {pool}=await import('../server/db.js'),{config}=await import('../server/config.js'),{migrate}=await import('../server/migrate.js'),{createApp}=await import('../server/app.js');
// Test registration uses a private development outbox; never send to a fabricated address over SMTP.
process.env.SMTP_HOST='';config.outbox=path.resolve('.local/final-verification/mail');
const output=path.resolve(live?'.local/final-verification':'.local/final-local');await mkdir(output,{recursive:true});await migrate();
const restoreFetch=live?()=>{}:(await import('./final-provider-fixtures.mjs')).installFixtures(config);
const report={date:new Date().toISOString(),mode:live?'real providers':'local fixtures',checks:[],providers:{smtp:process.env.SMTP_HOST?'configured':'development outbox'},failures:[]};
const record=async(name,details={})=>{if(!live)name=name.replace(/^Real /,'Fixture ');report.checks.push({name,...details});console.log('PASS',name,JSON.stringify(details));await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));};
const fail=async(name,error)=>{report.failures.push({name,error:String(error.message||error).slice(0,400)});console.log('FAIL',name);await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));};
const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;config.appUrl=origin;process.env.PUBLIC_APP_URL=config.appUrl;
let browser,userId,tripId,adminId;
const email=randomUUID()+'@final.test',password=randomUUID()+'Strong!';
try{
 browser=await openBrowser(output);await browser.viewport(1440);
 const {command,evaluate,wait,text,input,click,screenshot}=browser;
 const go=async(route,expected)=>{await command('Page.navigate',{url:origin+route});if(expected)await text(expected);};
 const api=async(route,body,method=body?'POST':'GET')=>{const r=await evaluate(`fetch(${JSON.stringify('/api'+route)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json','X-Requested-With':'TripSync'},body:${JSON.stringify(body?JSON.stringify(body):undefined)}}).then(async r=>({status:r.status,data:await r.json()}))`);assert(r.status<400,JSON.stringify(r.data));return r.data;};
 await go('/register','Create your account');await input('#email',email);await input('#password',password);await input('#confirm',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Verify your email');
 const [[user]]=await pool.execute('SELECT id FROM users WHERE email=?',[email]);userId=user.id;
 let code;for(const file of await readdir(config.outbox)){const content=await readFile(path.join(config.outbox,file),'utf8');if(content.includes('To: '+email))code=content.match(/code: (\d{6})/)?.[1];}assert(code);
 await input('input[autocomplete="one-time-code"]',code);await click('Verify');await text('Your Trips');await screenshot('desktop-home');await record('Fresh user registration, development email, verification and browser login');
 const destination=await api('/places/autocomplete',{input:'Rome',sessionToken:randomUUID()});assert(destination.suggestions.length);
 const resolved=await api('/places/details',{placeId:destination.suggestions[0].place_id,sessionToken:randomUUID()});report.providers.google_places='working';await record('Real destination autocomplete and details');
 try{const names=await api('/ai/trip-names',{destination:'Rome',travel_type:'plane'});assert(names.names?.length===3);report.providers.openai_names='working';await record('Real AI trip names');}catch(e){report.providers.openai_names='not working';await fail('AI trip names',e);}
 const trip=await api('/entities/Trip',{...resolved,name:'Rome · final verification',adults:2,start_date:'2026-10-05',end_date:'2026-10-09',travel_type:'plane',arrival_datetime:'2026-10-05T22:22',arrival_location:'Rome Fiumicino Airport',arrival_lat:41.8003,arrival_lng:12.2389,departure_datetime:'2026-10-09T20:00',departure_location:'Rome Fiumicino Airport',departure_lat:41.8003,departure_lng:12.2389,transport_preference:'mixed',max_walk_per_segment_min:30,max_walk_per_day_min:120,pace:'balanced',special_wishes:'Keep mornings calm. Prioritize the must-see places. Leave time for Italian meals.',food_preferences:'["Italian"]',dining_budget:'moderate',meal_duration_min:60,buffer_min:10});tripId=trip.id;const base='/trips/'+tripId;
 await api('/entities/TripItem',{trip_id:tripId,title:'Central Rome test stay',category:'stay',address:'Via del Corso, Rome, Italy',lat:41.901,lng:12.48,date:'2026-10-05',end_date:'2026-10-09',booking_status:'confirmed'});
 const places=[];
 for(const name of ['Pantheon','Colosseum','Trevi Fountain']){
  const found=await api('/places/resolve',{name,destination:'Rome'}),p=found.place||found.candidates?.[0];assert(p?.place_id);
  places.push(await api('/entities/PlaceSelection',{...p,trip_id:tripId,priority:'mandatory',selection_source:'google',desired_duration_min:60,status:'resolved',...(name==='Colosseum'?{ticket_purchased:true,fixed_date:'2026-10-07',fixed_time:'11:00'}:{})}));
 }
 await api(base+'/planning/windows',{items:['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'].map(date=>({id:randomUUID(),date,windows:'[{"start":"09:30","end":"18:30"}]',blocked:date==='2026-10-07'?'[{"start":"14:00","end":"15:00"}]':'[]'}))},'PUT');
 try{
  const suggestions=await api('/ai/planning-suggestions',{trip_id:tripId});assert(suggestions.suggestions.length);report.providers.openai_suggestions='working';
  for(const suggestion of suggestions.suggestions.slice(0,8)){const found=await api('/places/resolve',{name:suggestion.name,destination:'Rome'}),p=found.place;if(p&&!places.some(saved=>saved.place_id===p.place_id))places.push(await api('/entities/PlaceSelection',{...p,trip_id:tripId,priority:'preferred',selection_source:'ai',desired_duration_min:suggestion.visit_duration_min||90,status:'resolved'}));}
  await record('Real AI suggestions accepted and Google locations resolved',{selected:places.length});
 }catch(e){report.providers.openai_suggestions='not working';await fail('AI suggestions',e);}
 const photos=await api('/places/'+places[0].place_id+'/photos');assert(photos.photos.length);const photo=await evaluate(`fetch(${JSON.stringify(photos.photos[0].url)}).then(r=>({ok:r.ok,type:r.headers.get('content-type')}))`);assert(photo.ok&&photo.type.startsWith('image/'));await record('Real Google place photo');
 let plan=await api(base+'/itinerary',{use_ai:true});report.providers.openai_itinerary=plan.generation;assert(plan.items.some(i=>i.step_type==='visit'));await record('Five-day itinerary generated',{generation:plan.generation,visits:plan.items.filter(i=>i.step_type==='visit').length,optionalSaved:plan.unscheduledOptional.length,conflicts:plan.conflicts.map(c=>c.code||'review')});
 const [[routes]]=await pool.execute("SELECT SUM(success) AS successes,COUNT(*) AS total FROM provider_events WHERE user_id=? AND operation='routes'",[userId]);report.providers.google_routes=routes.successes?'working':'fallback only';await record('Routing verification',{calls:routes.total,successful:routes.successes||0});
 const meal=plan.items.find(i=>i.step_type==='meal');if(meal){try{const options=await api(base+'/meals/'+meal.id+'/options',{});assert(options.restaurants.length);await api(base+'/meals/'+meal.id+'/choice',{place_id:options.restaurants[0].place_id,token:options.token});await record('Real Google restaurant search and saved choice');}catch(e){await fail('Restaurant choice',e);}}
 plan=await api(base+'/itinerary');const movable=plan.items.find(i=>i.step_type==='visit'&&!i.locked&&i.ticket_status!=='purchased');
 if(movable){try{const preview=await api(base+'/itinerary/preview',{expected_version:plan.version,request:`Move ${movable.title} to ${movable.date==='2026-10-09'?'2026-10-06':'2026-10-09'}. Replace optional visits on the target day if needed, keeping all confirmed bookings and must-see places.`});await api(base+'/itinerary/apply',{token:preview.token});report.providers.openai_change='working';await record('Real natural-language change preview/apply');}catch(e){report.providers.openai_change='not working';await fail('Natural-language change',e);}}
 await api('/entities/Trip/'+tripId,{special_wishes:trip.special_wishes+' Include short rest breaks.'},'PATCH');
 await go('/trip/'+tripId,'Trip Health');await click('Review readiness');await click('Preview repair');await wait("document.body.innerText.includes('Review your itinerary update')",180000);await screenshot('desktop-repair');await click('Apply repair');await wait("!document.querySelector('[role=dialog]')",180000);await text('Undo last itinerary update');await record('Browser Trip Health preview/apply with Undo available');
 const QRCode=(await import('qrcode')).default,qr=await QRCode.toDataURL('TRIPSYNC TEST TICKET - NOT VALID FOR ENTRY',{width:900,margin:4});
 await evaluate(`fetch(${JSON.stringify(qr)}).then(r=>r.blob()).then(blob=>{const data=new FormData();data.append('file',blob,'verification-ticket.png');return fetch('/api/uploads/wallet',{method:'POST',headers:{'X-Requested-With':'TripSync'},body:data});}).then(async r=>{if(!r.ok)throw Error('Upload failed');return r.json();}).then(file=>window.__ticket=file)`);
 const file=await evaluate('window.__ticket'),ticket=await api(base+'/wallet/items',{item:{title:'Private verification ticket',category:'place'},attachments:[file]});await record('Private Wallet QR upload');
 const pdf=await evaluate(`fetch(${JSON.stringify('/api'+base+'/itinerary/pdf')}).then(async r=>({ok:r.ok,bytes:[...new Uint8Array(await r.arrayBuffer())]}))`);assert(pdf.ok);const bytes=Buffer.from(pdf.bytes);assert(bytes.subarray(0,4).toString()==='%PDF');await writeFile(path.join(output,'itinerary.pdf'),bytes);report.providers.pdf='working';await record('Real Chrome PDF export',{bytes:bytes.length});
 for(const width of [1440,390]){
  await browser.viewport(width,width===390?844:1000);const prefix=width===390?'mobile':'desktop';
  for(const [name,route,expected]of [['overview','/trip/'+tripId,'Trip Health'],['plan',base.replace('/trips/','/trip/')+'/plan?step=2','Preferences'],['suggestions','/trip/'+tripId+'/plan?step=4','Suggestions'],['itinerary','/trip/'+tripId+'/itinerary','Change itinerary'],['wallet','/trip/'+tripId+'/wallet','Travel Wallet'],['profile','/profile','Personal Details']]){
   await go(route,expected);await screenshot(prefix+'-'+name);const overflow=await evaluate('document.documentElement.scrollWidth>innerWidth+2');if(overflow)await fail(prefix+' '+name+' horizontal overflow',Error('Content exceeds viewport'));else await record(prefix+' '+name+' layout');
   if(name==='profile'){await click('Security & privacy','[role=tab]');await text('Active sessions');await screenshot(prefix+'-security');}
   if(name==='wallet'){await go('/trip/'+tripId+'/wallet?item='+ticket.id,'View file');await click('View file');await wait("!!document.querySelector('[data-wallet-file-content] img')?.complete");await screenshot(prefix+'-ticket-qr');assert(await evaluate("document.querySelector('[data-wallet-file-content] img').naturalWidth>=900"));await click('Close file');}
   if(name==='itinerary'){await click('Change itinerary');await text('Change your itinerary');await screenshot(prefix+'-change-itinerary');await click('Cancel');}
   if(name==='overview'){await click('Review readiness');await screenshot(prefix+'-health');await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});}
  }
 }
 const shared=await api(base+'/share',{enabled:true,hideStay:true});await api('/auth/logout',{});await go('/share/'+shared.share_token,trip.name);assert(!(await evaluate('document.body.innerText')).includes('Private verification ticket'));await record('Anonymous sharing omits Wallet files');
 await go('/login','Welcome back');await input('#email',email);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');await go('/trip/'+tripId,'Trip Health');assert((await api(base+'/itinerary')).items.length);await record('Logout/login preserves trip and itinerary');
 assert.equal(browser.exceptions.length,0);await record('No unhandled browser exceptions');
 await api('/auth/logout',{});
 await browser.viewport(1440);
 const {hashPassword}=await import('../server/security.js'),OTPAuth=await import('otpauth');
 adminId=randomUUID();const adminEmail=adminId+'@admin-final.test';await pool.execute("INSERT INTO users(id,email,password_hash,email_verified,role)VALUES(?,?,?,TRUE,'SUPER_ADMIN')",[adminId,adminEmail,await hashPassword(password)]);
 await go('/login','Welcome back');await input('#email',adminEmail);await input('#password',password);await evaluate("document.querySelector('form').requestSubmit()");await text('Your Trips');
 await go('/admin');await wait("document.body.innerText.toLowerCase().includes('authenticator')");await screenshot('admin-mfa');
 const setup=await api('/admin/mfa/setup',{password});const otp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(setup.secret)}).generate();await api('/admin/mfa/confirm',{password,code:otp});
 for(const route of ['','users','trips','audit','logs','health','ai','settings']){await go('/admin/'+route);await wait("document.querySelector('.admin-main')&&!document.body.innerText.includes('Loading…')");await screenshot('admin-'+(route||'dashboard'));}
 const diagnosis=await api('/admin/trips/'+tripId+'/diagnostics');assert(diagnosis.diagnostics);const repair=await api('/admin/trips/'+tripId+'/repair-preview',{reason:'Final regression preview only',confirmation:'PREVIEW'});assert(repair.token);await record('SUPER_ADMIN login, MFA, pages, diagnostics and repair preview');
}catch(error){await browser?.screenshot('failure').catch(()=>{});await fail('Final journey',error);process.exitCode=1;}
finally{
 await browser?.close();await new Promise(resolve=>server.close(resolve));
 if(!userId){const [[row]]=await pool.execute('SELECT id FROM users WHERE email=?',[email]);userId=row?.id;}
 if(adminId){await pool.execute('DELETE FROM users WHERE id=?',[adminId]);await pool.execute('DELETE FROM audit_events WHERE actor_user_id=?',[adminId]);}
 if(userId){const [files]=await pool.execute('SELECT filename FROM uploads WHERE owner_id=?',[userId]);await pool.execute('DELETE FROM users WHERE id=?',[userId]);for(const file of files)if(path.basename(file.filename)===file.filename)await unlink(path.join(config.uploads,file.filename)).catch(()=>{});}
 restoreFetch();await pool.end();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));if(report.failures.length)process.exitCode=1;
}
