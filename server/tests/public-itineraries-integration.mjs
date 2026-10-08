import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

test('Public SEO privacy boundary, MySQL publication, authentication, copy and administration',{skip:!process.env.MYSQL_TEST_DATABASE},async t=>{
  assert.match(process.env.MYSQL_TEST_DATABASE,/_test$/); process.env.MYSQL_DATABASE=process.env.MYSQL_TEST_DATABASE; process.env.NODE_ENV='test';
  const {pool,transaction}=await import('../db.js'),{migrate}=await import('../migrate.js'),{createApp}=await import('../app.js'),{hashPassword}=await import('../security.js');
  const {insertRecord}=await import('../entities.js'),{snapshot,inputHash}=await import('../itinerary-service.js'),{SCHEDULER_VERSION}=await import('../itinerary-engine.js');
  const {seedPublicItineraries,refreshTrip,drainPublicItineraryJobs,routeFor,canonicalFor}=await import('../public-itineraries/service.js'),{seedState,parseJson}=await import('../public-itineraries/sanitize.js'),{DESTINATIONS}=await import('../public-itineraries/catalog.js');
  await migrate();await migrate();
  const users=[],prefix=randomUUID(),password='Public SEO regression only! 123',settingsKeys=['billing_enabled','billing_enforcement_enabled','billing_mode','maintenance_enabled'];
  const [beforeSettings]=await pool.query('SELECT * FROM app_settings WHERE setting_key IN (?)',[settingsKeys]);
  const [beforeSeeds]=await pool.query("SELECT * FROM public_itineraries WHERE seed_key LIKE 'editorial-v1-%'");
  const setting=async(key,value)=>pool.execute('INSERT INTO app_settings(setting_key,value,version)VALUES(?,?,1) ON DUPLICATE KEY UPDATE value=VALUES(value),version=version+1',[key,JSON.stringify(value)]);
  await setting('billing_enabled',false);await setting('billing_enforcement_enabled',false);await setting('billing_mode','test');await setting('maintenance_enabled',false);
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;process.env.PUBLIC_APP_URL=origin;
  const api=async(path,cookie='',body=undefined,method=body?'POST':'GET')=>{const response=await fetch(origin+'/api'+path,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-Requested-With':'TripSync'},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const ok=async(...args)=>{const r=await api(...args);assert(r.status<400,JSON.stringify(r));return r.data;};
  async function account(role='USER'){const id=randomUUID(),email=prefix+'-'+users.length+'@qualified.example';users.push(id);await pool.execute('INSERT INTO users(id,email,password_hash,email_verified,role,public_itinerary_eligible)VALUES(?,?,?,TRUE,?,TRUE)',[id,email,await hashPassword(password),role]);const logged=await api('/auth/login','',{email,password});assert.equal(logged.status,200,JSON.stringify(logged.data));return {id,email,cookie:logged.cookie};}
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    for(const id of users)await pool.execute('DELETE FROM users WHERE id=?',[id]);
    await pool.query("DELETE FROM public_itineraries WHERE seed_key LIKE 'editorial-v1-%'");
    for(const row of beforeSeeds)await pool.query('INSERT INTO public_itineraries SET ?',{...row,snapshot:typeof row.snapshot==='string'?row.snapshot:JSON.stringify(row.snapshot)});
    await pool.query('DELETE FROM app_settings WHERE setting_key IN (?)',[settingsKeys]);for(const row of beforeSettings)await pool.query('INSERT INTO app_settings SET ?',{...row,value:typeof row.value==='object'?JSON.stringify(row.value):row.value});
    await new Promise(resolve=>setTimeout(resolve,50));await pool.end();
  });
  let seeds,rome,paris,source,publicSource,duplicate;
  const owner=await account(),reader=await account(),other=await account(),admin=await account('ADMIN');
  async function readyTrip(owner,duration=3,change=false){
    return transaction(async db=>{
      const source=seedState(DESTINATIONS[0]),end=`2030-01-0${duration}`;
      const trip=await insertRecord(db,'Trip',{name:'PRIVATE_SOURCE_PERSON',destination:'Rome',country:'Italy',start_date:'2030-01-01',end_date:end,adults:2,travel_type:'plane',arrival_datetime:'2030-01-01T07:00',departure_datetime:end+'T22:00',arrival_location:'PRIVATE_AIRPORT',departure_location:'PRIVATE_AIRPORT',special_wishes:'PRIVATE_NOTE PNR-ZQX123',share_public_itinerary:true,plan_status:'calculated'},owner.id);
      await insertRecord(db,'TripItem',{trip_id:trip.id,category:'stay',title:'PRIVATE_HOTEL',address:'PRIVATE_HOTEL_ADDRESS',date:'2030-01-01',end_date:end},owner.id);
      const items=source.items.filter(i=>i.date<=end);if(change)items[0].start_time='09:45';
      for(const [index,item] of items.entries())await insertRecord(db,'ItineraryItem',{...item,trip_id:trip.id,sort_order:index,title:item.title||'PRIVATE_RESTAURANT',duration_min:item.duration_min||60,notes:'PRIVATE_NOTE',source_status:'estimated'},owner.id,{internal:true});
      const state=await snapshot(db,trip.id,owner.id);await db.execute('UPDATE trips SET itinerary_meta=? WHERE id=?',[JSON.stringify({scheduler_version:SCHEDULER_VERSION,input_hash:inputHash(state),conflicts:[]}),trip.id]);
      return trip;
    });
  }
  await t.test('Migrations retain legacy opt-out; seeds are idempotent and pass the common publication pipeline',async()=>{
    seeds=await seedPublicItineraries();assert.equal(seeds.length,15);assert(seeds.every(row=>row.status==='published'&&row.quality_score>=85));const again=await seedPublicItineraries();assert.deepEqual(again.map(r=>r.public_id),seeds.map(r=>r.public_id));assert.deepEqual(again.map(r=>r.updated_at),seeds.map(r=>r.updated_at));rome=seeds.find(r=>r.city_key==='rome');paris=seeds.find(r=>r.city_key==='paris');
    const [[column]]=await pool.query("SHOW COLUMNS FROM trips LIKE 'share_public_itinerary'");assert.equal(column.Default,null);
  });
  await t.test('Indexable pages contain useful initial HTML, metadata/schema and readable canonical URLs',async()=>{
    const response=await fetch(origin+routeFor(rome));assert.equal(response.status,200);const html=await response.text();for(const value of [rome.title,rome.h1,canonicalFor(rome),'Colosseum','Day 4','application/ld+json','TouristTrip','BreadcrumbList','Customize with TripNexa'])assert(html.includes(value),value);assert.equal((html.match(/<h1>/g)||[]).length,1);assert(!html.includes('2030-'));assert.match(response.headers.get('cache-control'),/no-store/);assert.match(response.headers.get('content-security-policy'),/script-src 'none'/);
    const redirected=await fetch(origin+routeFor(rome)+'/?city=x',{redirect:'manual'});assert.equal(redirected.status,308);assert.equal(redirected.headers.get('location'),routeFor(rome));
    const thin=await fetch(origin+'/trips/rome/');assert.equal(thin.status,200);assert((await thin.text()).includes('noindex, follow'));
  });
  await t.test('Safe catalog has bounded pages, all filters, facets and restricted CORS',async()=>{
    const catalog=await ok('/public/itineraries?limit=2&page=1');assert.equal(catalog.items.length,2);assert(catalog.has_more);const second=await ok('/public/itineraries?limit=2&page=2');assert(!second.items.some(row=>row.public_id===catalog.items[0].public_id));
    const filtered=await ok('/public/itineraries?city=paris&country=France&duration=4&persona=family&intent=sightseeing&sort=duration');assert.equal(filtered.items.length,1);assert.equal(filtered.items[0].public_id,paris.public_id);assert(filtered.facets.cities.length>=15);
    for(const key of ['source_trip_id','user_id','owner_id','snapshot','start_date','booking','email','itinerary_meta'])assert(!JSON.stringify(catalog).includes('"'+key+'"'),key);
    for(const query of ['limit=25','owner_id=x','page=-1','duration=100','sort=city%3BDROP'])assert.equal((await api('/public/itineraries?'+query)).status,400);
    const cors=await fetch(origin+'/api/public/itineraries',{headers:{Origin:'https://tripnexa.app'}});assert.equal(cors.headers.get('access-control-allow-origin'),'https://tripnexa.app');assert.equal(cors.headers.get('access-control-allow-credentials'),null);
    assert.equal((await fetch(origin+'/api/public/itineraries',{headers:{Origin:'https://foreign.example'}})).headers.get('access-control-allow-origin'),null);
  });
  await t.test('Completed approved source publishes automatically; incomplete sources and private URLs stay unavailable',async()=>{
    source=await readyTrip(owner);await drainPublicItineraryJobs(100);const [[row]]=await pool.execute('SELECT * FROM public_itineraries WHERE source_trip_id=?',[source.id]);assert.equal(row.status,'published',JSON.stringify({reason:row.eligibility_reason}));assert(row.indexable);publicSource=row;
    const html=await (await fetch(origin+routeFor(row))).text();for(const secret of ['PRIVATE_SOURCE_PERSON','PRIVATE_AIRPORT','PRIVATE_HOTEL','PRIVATE_NOTE','PNR-ZQX123','2030-01-',source.id,owner.id,owner.email])assert(!html.includes(secret),secret);
    await ok('/entities/Trip/'+source.id,owner.cookie,{planning_step:1,share_public_itinerary:true},'PATCH');assert.equal((await fetch(origin+routeFor(publicSource))).status,200,'Navigating the planner and unchanged consent must not withdraw a ready public page');
    const incomplete=await ok('/entities/Trip',owner.cookie,{name:'Incomplete',destination:'Rome'});await refreshTrip(incomplete.id);const [[draft]]=await pool.execute('SELECT * FROM public_itineraries WHERE source_trip_id=?',[incomplete.id]);assert.equal(draft.indexable,0);assert.equal(draft.status,'draft');assert.deepEqual(parseJson(draft.snapshot),{});
    for(const url of ['/trips/rome/'+source.id,'/trips/'+source.id,'/trips/pending/'+draft.slug])assert.equal((await fetch(origin+url)).status,404);
  });
  await t.test('Consent withdrawal immediately invalidates HTML, catalog, sitemap and copying; re-enable can republish',async()=>{
    await ok('/entities/Trip/'+source.id,owner.cookie,{share_public_itinerary:false},'PATCH');assert.equal((await fetch(origin+routeFor(publicSource))).status,404);assert.equal((await api('/public-itineraries/'+publicSource.public_id+'/copy',reader.cookie,{})).status,404);
    const xml=await (await fetch(origin+'/sitemap-public-itineraries-1.xml')).text();assert(!xml.includes(canonicalFor(publicSource)));
    assert(!(await ok('/public/itineraries?city=rome')).items.some(r=>r.public_id===publicSource.public_id));
    await refreshTrip(source.id);assert.equal((await fetch(origin+routeFor(publicSource))).status,404);await ok('/entities/Trip/'+source.id,owner.cookie,{share_public_itinerary:true},'PATCH');await refreshTrip(source.id);assert.equal((await fetch(origin+routeFor(publicSource))).status,200);
    assert.equal((await api('/entities/Trip/'+source.id,reader.cookie,{share_public_itinerary:false},'PATCH')).status,404);
  });
  await t.test('Near-identical routes are noindex with original canonical and omitted from discovery/sitemaps',async()=>{
    const trip=await readyTrip(other,3,true);duplicate=await refreshTrip(trip.id);assert.equal(duplicate.indexable,0);assert.equal(duplicate.duplicate_of,publicSource.public_id);const html=await (await fetch(origin+routeFor(duplicate))).text();assert(html.includes('noindex, follow'));assert(html.includes(`rel="canonical" href="${canonicalFor(publicSource)}"`));assert(!(await (await fetch(origin+'/sitemap-public-itineraries-1.xml')).text()).includes(canonicalFor(duplicate)));
  });
  await t.test('Concurrent publishers choose one indexable original; changing duration handles an existing slug safely',async()=>{
    const a=await readyTrip(owner,2),b=await readyTrip(other,2,true);const published=await Promise.all([refreshTrip(a.id),refreshTrip(b.id)]);assert.equal(published.filter(r=>r.indexable).length,1);assert.equal(new Set(published.map(r=>r.slug)).size,2);
    const original=published.find(r=>r.source_trip_id===a.id),oldUrl=routeFor(original);
    await transaction(async db=>{
      await db.execute("UPDATE trips SET end_date='2030-01-04',departure_datetime='2030-01-04T22:00' WHERE id=?",[a.id]);await db.execute("UPDATE trip_items SET end_date='2030-01-04' WHERE trip_id=? AND category='stay'",[a.id]);
      for(const [index,item] of seedState(DESTINATIONS[0]).items.filter(i=>i.date>'2030-01-02').entries())await insertRecord(db,'ItineraryItem',{...item,trip_id:a.id,sort_order:index+6,title:item.title||'Lunch',duration_min:item.duration_min||60},owner.id,{internal:true});
      const state=await snapshot(db,a.id,owner.id);await db.execute('UPDATE trips SET itinerary_meta=? WHERE id=?',[JSON.stringify({scheduler_version:SCHEDULER_VERSION,input_hash:inputHash(state),conflicts:[]}),a.id]);
    });
    const changed=await refreshTrip(a.id);assert.equal(changed.public_id,original.public_id);assert(changed.slug.startsWith('4-day-'));assert.notEqual(changed.slug,rome.slug);assert.equal(changed.indexable,0);assert.equal(changed.duplicate_of,rome.public_id);assert.equal((await fetch(origin+oldUrl)).status,404);assert.equal((await fetch(origin+routeFor(changed))).status,200);
  });
  await t.test('Logged-out customize preserves only a public ID in an HttpOnly cookie through login',async()=>{
    const response=await fetch(origin+'/customize/'+rome.public_id);assert.equal(response.status,200);const intent=response.headers.get('set-cookie');assert(intent.includes('HttpOnly'));assert(intent.includes('SameSite=Lax'));assert(!intent.includes(source.id));assert.equal((await api('/public-itineraries/'+rome.public_id+'/copy','',{})).status,401);
    const resumed=await ok('/public-itineraries/intent',reader.cookie+'; '+intent.split(';')[0]);assert.equal(resumed.returnTo,'/customize/'+rome.public_id);assert.equal((await ok('/public-itineraries/intent',reader.cookie+'; tripnexa_public_intent=//evil.example')).returnTo,'/');
  });
  let copied;
  await t.test('Concurrent customize clicks create one owned private trip and obey the lifetime free allowance',async()=>{
    await setting('billing_enforcement_enabled',true);
    const responses=await Promise.all([api('/public-itineraries/'+rome.public_id+'/copy',reader.cookie,{}),api('/public-itineraries/'+rome.public_id+'/copy',reader.cookie,{})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,201],JSON.stringify(responses));assert.equal(responses[0].data.trip_id,responses[1].data.trip_id);copied=responses[0].data.trip_id;
    const trip=await ok('/entities/Trip/'+copied,reader.cookie);assert.equal(trip.created_by_id,reader.id);assert.equal(trip.start_date,null);assert.equal(trip.arrival_datetime,null);assert.equal(trip.share_enabled,false);assert.equal(trip.share_public_itinerary,true);assert(trip.itinerary_meta.includes('public-example-pending'));assert.notEqual(copied,source.id);
    const places=await ok('/entities/PlaceSelection?trip_id='+copied,reader.cookie);assert.equal(places.length,8);assert(places.some(p=>p.name==='Colosseum'));
    const combined=JSON.stringify({trip,places});for(const value of [owner.id,owner.email,source.id,'PRIVATE_HOTEL','PNR-ZQX123','2030-01-'])assert(!combined.includes(value),value);
    assert.equal((await api('/entities/Trip/'+copied,owner.cookie)).status,404);const blocked=await api('/public-itineraries/'+paris.public_id+'/copy',reader.cookie,{});assert.equal(blocked.status,402);assert.equal(blocked.data.code,'TRIP_LIMIT_REACHED');
  });
  await t.test('Personal dates materialize the safe day structure into editable existing planner records only once',async()=>{
    await ok('/entities/Trip/'+copied,reader.cookie,{start_date:'2031-05-01',end_date:'2031-05-04'},'PATCH');const items=await ok('/entities/ItineraryItem?trip_id='+copied,reader.cookie);assert.equal(items.length,12);assert.equal(new Set(items.map(i=>i.date)).size,4);assert(items.some(i=>i.title==='Colosseum'));assert(items.every(i=>i.date.startsWith('2031-05-')&&!i.locked&&!i.source_url));
    await ok('/entities/Trip/'+copied,reader.cookie,{start_date:'2031-05-01',end_date:'2031-05-04'},'PATCH');assert.equal((await ok('/entities/ItineraryItem?trip_id='+copied,reader.cookie)).length,12);
    const plan=await ok('/trips/'+copied+'/itinerary',reader.cookie);assert(plan.requiresRegeneration);assert.equal(plan.generation,'public-example');assert.equal((await ok('/entities/TripItem?trip_id='+copied,reader.cookie)).length,0);
    await ok('/entities/ItineraryItem/'+items[0].id,reader.cookie,{title:'My editable visit'},'PATCH');assert.equal((await ok('/entities/ItineraryItem/'+items[0].id,reader.cookie)).title,'My editable visit');
  });
  await t.test('Admin actions require MFA, validate reasons, leave audit records and control indexability',async()=>{
    assert.equal((await api('/admin/public-itineraries',reader.cookie)).status,403);assert.equal((await api('/admin/public-itineraries',admin.cookie)).status,403);await pool.execute('UPDATE sessions SET mfa_verified_at=UTC_TIMESTAMP(3) WHERE user_id=?',[admin.id]);
    const listing=await ok('/admin/public-itineraries',admin.cookie);assert(listing.items.length);assert(!JSON.stringify(listing).includes(owner.email));assert(!JSON.stringify(listing).includes('source_trip_id'));
    const action=type=>ok('/admin/public-itineraries/'+rome.public_id,admin.cookie,{action:type,reason:'Publication regression check',confirmation:'UPDATE'});
    assert.equal((await api('/admin/public-itineraries/'+rome.public_id,admin.cookie,{action:'hide',reason:'x',confirmation:'UPDATE'})).status,400);
    await action('noindex');assert((await (await fetch(origin+routeFor(rome))).text()).includes('noindex, follow'));assert(!(await (await fetch(origin+'/sitemap-public-itineraries-1.xml')).text()).includes(canonicalFor(rome)));
    await action('hide');assert.equal((await fetch(origin+routeFor(rome))).status,404);await action('regenerate');assert.equal((await fetch(origin+routeFor(rome))).status,404);await action('restore');assert.equal((await fetch(origin+routeFor(rome))).status,200);
    const [[{count}]]=await pool.execute("SELECT COUNT(*) AS count FROM audit_events WHERE target_id=? AND action LIKE 'public_itinerary.%'",[rome.public_id]);assert(count>=4);
  });
  await t.test('Sitemap index shards only visible indexable pages and feature-off suppresses public surfaces',async()=>{
    const index=await (await fetch(origin+'/sitemap.xml')).text();assert(index.includes('sitemap-public-itineraries-1.xml'));const sitemap=await (await fetch(origin+'/sitemap-public-itineraries-1.xml')).text();assert(sitemap.includes(canonicalFor(rome)));assert(sitemap.includes('<lastmod>'));assert(!sitemap.includes(source.id));assert(!sitemap.includes(canonicalFor(duplicate)));assert.equal((await fetch(origin+'/sitemap-public-itineraries-99999.xml')).status,404);
    const robots=await (await fetch(origin+'/robots.txt')).text();assert(robots.includes('Allow: /trips/'));assert(!robots.includes('Disallow: /trips/'));
    await setting('maintenance_enabled',true);for(const path of ['/api/public/itineraries','/sitemap.xml',routeFor(rome)])assert.equal((await fetch(origin+path)).status,503);await setting('maintenance_enabled',false);
  });
  await t.test('Deleting source or suspending source account withdraws public access; analytics contain no account IDs',async()=>{
    await pool.execute("UPDATE users SET status='SUSPENDED' WHERE id=?",[owner.id]);assert.equal((await fetch(origin+routeFor(publicSource))).status,404);await pool.execute("UPDATE users SET status='ACTIVE' WHERE id=?",[owner.id]);await pool.execute('DELETE FROM trips WHERE id=?',[source.id]);assert.equal((await fetch(origin+routeFor(publicSource))).status,404);
    const [events]=await pool.query("SELECT user_id,event FROM analytics_events WHERE event IN ('public_itinerary_view','public_itinerary_customize_click','public_itinerary_clone_created','trip_examples_filter','trip_examples_view','share_public_itinerary_toggle')");assert(events.length);assert(events.every(e=>e.user_id===null));
  });
});
