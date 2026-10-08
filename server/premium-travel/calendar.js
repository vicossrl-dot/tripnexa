import {createHash} from 'node:crypto';
import {eventInterval,localMinute,localStamp} from '../itinerary-time.js';
import {serverMessage} from '../i18n.js';
import {pdfText} from '../pdf-i18n.js';
import {assert} from '../errors.js';

export const icsText=value=>String(value??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');
export function foldIcs(line){let parts=[],part='',size=0;for(const character of line){const length=Buffer.byteLength(character);if(size+length>75){parts.push(part);part=' ';size=1;}part+=character;size+=length;}parts.push(part);return parts.join('\r\n');}
const utcStamp=time=>new Date(time).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function wallClockUtc(value,timezone){
 assert(typeof timezone==='string'&&timezone.length>0,400,'Set a valid trip timezone in Update Plan before exporting a calendar.');
 const local=localMinute(value);assert(local!==null,400,'A scheduled calendar time is invalid.');
 let formatter;try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{assert(false,400,'Set a valid trip timezone in Update Plan before exporting a calendar.');}
 const text=time=>{const parts=Object.fromEntries(formatter.formatToParts(new Date(time)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;};
 const naive=local*60000,offsets=new Set();
 for(let hours=-36;hours<=36;hours+=6){const sample=naive+hours*3600000;offsets.add(localMinute(text(sample))*60000-sample);}
 const candidates=[...offsets].map(offset=>naive-offset).filter(time=>text(time)===value);
 assert(candidates.length===1,400,'A scheduled time falls in a daylight-saving clock change. Review this time in Update Plan before exporting.');return candidates[0];
}
export function calendarIcs(trip,plan,{dates=[],includeTransfers=true,tripUrl,now=new Date()}={}){
 assert(trip.timezone,400,'Set the trip timezone in Update Plan before exporting a calendar.');
 assert(Array.isArray(dates)&&dates.every(date=>plan.dates.includes(date)),400,'Choose valid itinerary days.');
 const selected=dates.length?new Set(dates):null,events=[];let skipped=0;
 for(const item of plan.items){
  if(selected&&!selected.has(item.date))continue;
  if(!['visit','activity','meal','arrival','departure','transport','transfer'].includes(item.step_type)||!includeTransfers&&['transport','transfer'].includes(item.step_type))continue;
  const {start,end}=eventInterval(item);if(start===null||end===null||end<=start){skipped++;continue;}
  const begin=wallClockUtc(localStamp(start),trip.timezone),finish=wallClockUtc(localStamp(end),trip.timezone);
  assert(finish>begin,400,'A calendar event has an invalid time range. Review the saved schedule.');
  const uid=createHash('sha256').update(`${trip.id}:${item.id}`).digest('hex')+'@tripnexa.app';
  let restaurant;try{restaurant=item.step_type==='meal'?JSON.parse(item.meal_choice||'null'):null;}catch{}
  const location=restaurant?.address||item.address||item.location||'';
  const description=serverMessage(`Saved TripNexa itinerary. Times converted from ${trip.timezone}.`)+(['transport','transfer'].includes(item.step_type)?`\n${serverMessage(item.route_mode||'Transfer')} · ${item.route_duration_min??item.duration_min??'Unknown'} min\n${item.route_origin||''} → ${item.route_destination||''}`:'')+`\n${serverMessage('Updates are not synchronized automatically.')}${tripUrl?'\n'+serverMessage('Open your private trip:')+' '+tripUrl:''}`;
  events.push('BEGIN:VEVENT',`UID:${uid}`,`DTSTAMP:${utcStamp(now)}`,`SEQUENCE:${Math.max(0,Number(plan.version)||0)}`,`DTSTART:${utcStamp(begin)}`,`DTEND:${utcStamp(finish)}`,`SUMMARY:${icsText(restaurant?serverMessage('Meal')+' · '+restaurant.name:pdfText(item.title))}`,`LOCATION:${icsText(location)}`,`DESCRIPTION:${icsText(description)}`,...(tripUrl?[`URL:${tripUrl}`]:[]),'END:VEVENT');
 }
 assert(events.length,400,'No complete timed activities are available for the selected days. Review your saved schedule.');
 return {content:['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TripNexa//Saved itinerary//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',...events,'END:VCALENDAR'].map(foldIcs).join('\r\n')+'\r\n',skipped};
}
