import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarIcs,wallClockUtc,foldIcs} from '../premium-travel/calendar.js';
const trip={id:'trip',timezone:'Asia/Tokyo'};
const item={id:'visit',date:'2026-10-07',step_type:'visit',title:'Museum, garden; 日本\nNext line',start_time:'10:00',end_time:'11:00',location:'Kyoto',notes:'SECRET NOTE',source_url:'https://private.invalid/ticket?token=SECRET'};
const plan={dates:['2026-10-07','2026-10-08'],version:2,items:[item]};
test('Calendar uses saved local timezone, stable hashed UID, CRLF and RFC 5545 escaping',()=>{
 const options={tripUrl:'https://tripnexa.app/trip/trip/itinerary',now:new Date('2026-10-01T00:00:00Z')};
 const a=calendarIcs(trip,plan,options).content,b=calendarIcs(trip,plan,options).content;
 assert.equal(a,b);assert.match(a,/DTSTART:20261007T010000Z/);assert.match(a,/DTEND:20261007T020000Z/);assert.match(a,/SUMMARY:Museum\\, garden\\; 日本\\nNext line/);assert.match(a.replaceAll('\r\n ',''),/UID:[a-f0-9]{64}@tripnexa.app/);assert.match(a,/DTSTAMP:20261001T000000Z/);
 assert(!a.includes('SECRET'));assert.match(a,/VERSION:2.0\r\nPRODID:/);assert(!a.replaceAll('\r\n','').includes('\n'));
});
test('Overnight and explicitly represented multi-day events retain actual saved end dates',()=>{
 const overnight={...item,start_time:'23:30',end_time:'01:15'},multi={...item,id:'multi',start_time:'22:00',end_time:'10:00',start_datetime:'2026-10-07T22:00',end_datetime:'2026-10-09T10:00'};
 const result=calendarIcs(trip,{...plan,items:[overnight,multi]}).content;assert.match(result,/DTEND:20261007T161500Z/);assert.match(result,/DTEND:20261009T010000Z/);
});
test('Selection and optional transfers preserve the original itinerary without regeneration',()=>{
 const source={...plan,items:[item,{...item,id:'day2',date:'2026-10-08'},{...item,id:'transfer',step_type:'transport',route_mode:'walk'},{...item,id:'buffer',step_type:'access'}]},before=JSON.stringify(source);
 const content=calendarIcs(trip,source,{dates:['2026-10-07'],includeTransfers:false}).content;assert.equal((content.match(/BEGIN:VEVENT/g)||[]).length,1);assert.equal(JSON.stringify(source),before);assert.throws(()=>calendarIcs(trip,source,{dates:['2027-01-01']}));
});
test('Missing timezone and DST gaps/ambiguities are rejected explicitly, not guessed',()=>{
 assert.throws(()=>calendarIcs({...trip,timezone:null},plan),error=>error.status===400);
 assert.throws(()=>wallClockUtc('2026-03-08T02:30','America/New_York'),/clock change/);
 assert.throws(()=>wallClockUtc('2026-11-01T01:30','America/New_York'),/clock change/);
 assert.equal(new Date(wallClockUtc('2026-03-08T03:30','America/New_York')).toISOString(),'2026-03-08T07:30:00.000Z');
});
test('Unicode line folding is at most 75 bytes and unfolds without corrupting characters',()=>{
 const text='SUMMARY:'+('日本, garden '.repeat(30));const folded=foldIcs(text);assert(folded.split('\r\n').every(line=>Buffer.byteLength(line)<=75));assert.equal(folded.replaceAll('\r\n ',''),text);
});
test('Incomplete timed events are counted as omitted; an empty export is rejected',()=>{
 const bad={...item,id:'missing',end_time:null};assert.equal(calendarIcs(trip,{...plan,items:[item,bad]}).skipped,1);assert.throws(()=>calendarIcs(trip,{...plan,items:[bad]}),/No complete timed/);
});
