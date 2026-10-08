import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeatherCache} from '../weather/cache.js';
import {createMetProvider,normalizeMetDay,localWeatherDate} from '../weather/provider-met.js';
import {createNasaProvider,normalizeNasaMonth} from '../weather/provider-nasa-power.js';
import {createWeatherService,dayWeatherLocation} from '../weather/service.js';
import {temperatureLabel,weatherCondition,loadTripWeather,readWeatherUnit,saveWeatherUnit,WEATHER_UNIT_KEY} from '../../src/lib/trip-weather.js';

const point=(time,temp,span=1,rain=1)=>({time,data:{instant:{details:{air_temperature:temp,wind_speed:3}},[`next_${span}_hours`]:{summary:{symbol_code:'partlycloudy_day'},details:{precipitation_amount:rain}}}});
const metData={properties:{meta:{updated_at:'2026-10-06T00:00:00Z',units:{air_temperature:'celsius'}},timeseries:[point('2026-10-06T23:00:00Z',10),point('2026-10-07T00:00:00Z',18),point('2026-10-07T06:00:00Z',20,6,2),point('2026-10-07T12:00:00Z',12,6,3)]}};
const nasaData={header:{fill_value:-999,range:'January 2001 - December 2020'},parameters:{T2M_MAX_AVG:{units:'C'},T2M_MIN_AVG:{units:'C'},PRECTOTCORR:{units:'mm/day'}},properties:{parameter:{T2M_MAX_AVG:{OCT:24,JUN:28},T2M_MIN_AVG:{OCT:14,JUN:18},PRECTOTCORR:{OCT:2,JUN:3}}}};
const trip={id:'trip',destination:'Kyoto',destination_latitude:35.01,destination_longitude:135.77,timezone:'Asia/Tokyo',start_date:'2026-10-07',end_date:'2026-10-08'};
const state={trip,items:[{id:'one',date:'2026-10-07',step_type:'visit',lat:35,lng:135}],stays:[],selections:[]};

test('Forecast dates use the saved local timezone, including UTC midnight and DST',()=>{
 assert.equal(localWeatherDate('2026-10-06T23:00:00Z','Asia/Tokyo'),'2026-10-07');
 assert.equal(localWeatherDate('2026-10-07T01:00:00Z','America/Los_Angeles'),'2026-10-06');
 assert.equal(localWeatherDate('2026-11-01T08:00:00Z','America/Los_Angeles'),'2026-11-01');
 const day=normalizeMetDay(metData,'2026-10-07','Asia/Tokyo');assert.equal(day.kind,'forecast');assert.equal(day.temperature.highC,20);assert.equal(day.temperature.lowC,10);
 assert.equal(normalizeMetDay(metData,'2026-11-01','Asia/Tokyo'),null);
});
test('Intervals never overlap or cross local midnight; no fabricated probability or feels-like',()=>{
 const data=structuredClone(metData);data.properties.timeseries.splice(3,0,point('2026-10-07T07:00:00Z',18,6,100));
 const day=normalizeMetDay(data,'2026-10-07','Asia/Tokyo');assert.equal(day.precipitation.amountMm,4);assert.equal(day.precipitation.coveredHours,8);
 assert(!('probabilityPercent' in day.precipitation));assert(!('feelsLikeC' in day.temperature));assert.equal(day.wind.speedKmh,11);
 data.properties.timeseries[1].data.next_1_hours.details.probability_of_precipitation=40;
 assert.equal(normalizeMetDay(data,'2026-10-07','Asia/Tokyo').precipitation.probabilityPercent,40);
});
test('NASA climatology uses month keys, real units, fill values and explicit typical labels',()=>{
 const day=normalizeNasaMonth(nasaData,'2027-06-08');assert.equal(day.kind,'typical');assert.equal(day.temperature.highC,28);assert.equal(day.precipitation.dailyAverageMm,3);assert(!day.symbol);
 const missing=structuredClone(nasaData);missing.properties.parameter.PRECTOTCORR.OCT=-999;assert(!normalizeNasaMonth(missing,'2026-10-01').precipitation);
 missing.properties.parameter.T2M_MIN_AVG.OCT=-999;assert.throws(()=>normalizeNasaMonth(missing,'2026-10-01'));
});
test('Each day chooses its dated stay, then a real visit/restaurant, then destination; never geocodes',()=>{
 const days={...state,stays:[{id:'a',category:'stay',date:'2026-10-07',end_date:'2026-10-07',lat:1,lng:2,title:'Hotel A'},{id:'b',category:'stay',date:'2026-10-08',end_date:'2026-10-10',lat:3,lng:4,title:'Hotel B'}]};
 assert.equal(dayWeatherLocation(days,'2026-10-07').locationLabel,'Hotel A');assert.equal(dayWeatherLocation(days,'2026-10-08').lat,3);
 assert.equal(dayWeatherLocation(state,'2026-10-07').lat,35);assert.equal(dayWeatherLocation(state,'2026-10-08').lat,35.01);
 const meal={...state,items:[{date:'2026-10-07',step_type:'meal',meal_choice:JSON.stringify({name:'Restaurant',lat:8,lng:9,anchor:{lat:1,lng:2}})}]};
 assert.equal(dayWeatherLocation(meal,'2026-10-07').lat,8);
 assert.equal(dayWeatherLocation({...state,trip:{},items:[{date:'2026-10-07',step_type:'visit',lat:null,lng:''} ]},'2026-10-07'),null);
});
test('Linked saved selection supplies coordinates but stale or ambiguous data does not',()=>{
 const linked={...state,items:[{date:'2026-10-07',step_type:'visit',selection_id:'s',address:'Museum'}],selections:[{id:'s',address:'Museum',lat:6,lng:7}]};
 assert.equal(dayWeatherLocation(linked,'2026-10-07').lat,6);linked.items[0].address='Different';assert.equal(dayWeatherLocation(linked,'2026-10-07').lat,35.01);
});
test('Actual response timestamps decide mixed Forecast/Typical, requests deduplicate, itinerary stays immutable',async()=>{
 let met=0,nasa=0;const input={...state,items:state.items.map(item=>({...item,lat:trip.destination_latitude,lng:trip.destination_longitude}))},before=JSON.stringify(input);
 const run=createWeatherService({met:async()=>{met++;return metData;},nasa:async()=>{nasa++;return nasaData;}});
 assert.deepEqual((await run(input)).days.map(day=>day.kind),['forecast','typical']);assert.equal(met,1);assert.equal(nasa,1);assert.equal(JSON.stringify(input),before);
});
test('Provider outage never becomes a fake forecast/climate substitution, no-location or empty trips make no requests',async()=>{
 let nasa=0;const run=createWeatherService({met:async()=>{throw Error('Outage');},nasa:async()=>{nasa++;return nasaData;}});
 assert((await run(state)).days.every(day=>day.kind==='unavailable'));assert.equal(nasa,0);
 assert.deepEqual(await run({...state,items:[]}),{days:[]});
 assert((await run({...state,trip:{...trip,timezone:null}})).days.every(day=>day.kind==='unavailable'));
});
test('Cache coalesces concurrent requests, respects expiry and uses exact Last-Modified on 304',async()=>{
 let time=0,calls=0;const headers=[];const read=createWeatherCache({now:()=>time,fetcher:async(_url,options)=>{calls++;headers.push(options.headers);return new Response(calls===1?JSON.stringify(metData):null,{status:calls===1?200:304,headers:{'Cache-Control':'max-age=120','Last-Modified':'Tue, 06 Oct 2026 00:00:00 GMT'}});}});
 await Promise.all([read('url'),read('url'),read('url')]);assert.equal(calls,1);time=119000;await read('url');assert.equal(calls,1);
 time=121000;assert.deepEqual(await read('url'),metData);assert.equal(headers[1]['If-Modified-Since'],'Tue, 06 Oct 2026 00:00:00 GMT');
});
test('Provider failures and 429 back off across coordinates; cache stays bounded',async()=>{
 let calls=0,time=0;const read=createWeatherCache({now:()=>time,maxEntries:2,fetcher:async()=>{calls++;return new Response(null,{status:429,headers:{'Retry-After':'600'}});}});
 await assert.rejects(read('a'));await assert.rejects(read('a'));await assert.rejects(read('b'));assert.equal(calls,1);
 time=601000;await assert.rejects(read('c'));assert.equal(calls,2);
});
test('Server provider URLs contain rounded coordinates and necessary parameters only, MET identifies client, NASA caches months together',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(url.includes('met.no')?metData:nasaData));};
 const met=createMetProvider({fetcher}),nasa=createNasaProvider({fetcher});
 await met({lat:35.0123456,lng:135.7654321});await met({lat:35.01234,lng:135.76543});await nasa({lat:35,lng:135});await nasa({lat:35,lng:135});
 assert.equal(calls.length,2);assert.match(calls[0].url,/lat=35.012&lon=135.765$/);assert.match(calls[0].options.headers['User-Agent'],/TripNexa.*https:/);assert(!calls[0].url.includes('trip'));
 assert.match(calls[1].url,/T2M_MAX_AVG,T2M_MIN_AVG,PRECTOTCORR/);
});
test('Global unit storage survives unavailable localStorage, conversion and icons do not invent weather',()=>{
 assert.equal(temperatureLabel(0,'F'),'32°');assert.equal(temperatureLabel(20,'C'),'20°');assert.equal(weatherCondition(null).label,'');assert.equal(weatherCondition('lightrainshowers_day').icon,'rain');
 const previous=globalThis.localStorage;const entries=new Map();globalThis.localStorage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)};
 try{saveWeatherUnit('F');assert.equal(readWeatherUnit(),'F');assert.equal(entries.get(WEATHER_UNIT_KEY),'F');globalThis.localStorage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};assert.equal(readWeatherUnit(),'C');saveWeatherUnit('F');}finally{if(previous)globalThis.localStorage=previous;else delete globalThis.localStorage;}
});
test('Repeated frontend renders share a request and failures do not trigger request storms',async()=>{
 let calls=0;const load=async()=>{calls++;return {days:[]};};await Promise.all([loadTripWeather('fixture',load,0),loadTripWeather('fixture',load,1)]);assert.equal(calls,1);
 const fail=async()=>{calls++;throw Error('Unavailable');};await assert.rejects(loadTripWeather('failure',fail,0));await assert.rejects(loadTripWeather('failure',fail,1));assert.equal(calls,2);
});
