import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../app.js';
import {pool} from '../db.js';

test('Weather API is private, ownership-scoped, available without billing and read-only',async t=>{
 const executed=[];
 t.mock.method(pool,'query',async()=>[[]]);
 t.mock.method(pool,'execute',async(sql,params)=>{
  executed.push({sql,params});
  if(sql.includes('FROM sessions s'))return [[{id:'user',status:'ACTIVE',role:'USER',session_id:'session'}]];
  if(sql.includes('FROM trips WHERE id='))return [params[0]==='owned'&&params[1]==='user'?[{id:'owned',owner_id:'user',destination:'Kyoto',start_date:'2027-06-08',end_date:'2027-06-08',timezone:'Asia/Tokyo'}]:[]];
  if(sql.includes('FROM itinerary_items'))return [[{id:'visit',trip_id:'owned',owner_id:'user',date:'2027-06-08',step_type:'visit'}]];
  return [[]];
 });
 const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const call=(id,cookie)=>fetch(`${origin}/api/trips/${id}/weather`,{headers:cookie?{Cookie:`tripsync_session=${'a'.repeat(64)}`}:{}});
 assert.equal((await call('owned')).status,401);
 assert.equal((await call('another',true)).status,404);
 const response=await call('owned',true);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.deepEqual(await response.json(),{days:[{date:'2027-06-08',locationLabel:'Kyoto',kind:'unavailable'}]});
 for(const {sql,params} of executed.filter(row=>/FROM (itinerary_items|trip_items|place_selections)/.test(row.sql))){assert.match(sql,/trip_id=\? AND owner_id=\?/);assert.deepEqual(params,['owned','user']);}
 assert(!executed.some(row=>/(INSERT INTO|UPDATE|DELETE FROM) (trips|itinerary_items|billing_)/.test(row.sql)));
 assert.equal((await fetch(`${origin}/api/shared/fixture/weather`)).status,404);
});
