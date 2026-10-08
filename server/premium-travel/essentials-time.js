// Date-specific IANA offsets from the runtime's timezone database, never AI memory.
import {countryName,countryCode} from '../../src/lib/country-codes.js';
export function validTimezone(value){try{if(typeof value!=='string'||value.length>100)return null;return new Intl.DateTimeFormat('en-GB',{timeZone:value}).resolvedOptions().timeZone;}catch{return null;}}
export function savedOrigin(state){
 const text=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,100):null;
 const known={MD:{timezone:'Europe/Chisinau'},RO:{timezone:'Europe/Bucharest'}};
 const destination=validTimezone(state.trip.timezone),arrival=state.trip.arrival_datetime?.slice(0,10)||state.trip.start_date;
 // Only a saved inbound transport with matching arrival date/zone supplies departure context.
 const flights=(state.tripItems||[]).filter(item=>item.category==='flight'&&item.arrival_datetime?.slice(0,10)===arrival&&destination&&validTimezone(item.arrival_timezone)===destination);
 const origins=flights.map(item=>({country:countryCode(item.departure_country),city:text(item.departure_city),timezone:validTimezone(item.departure_timezone)})).filter(value=>value.country||value.city||value.timezone);
 const zones=[...new Set(origins.map(value=>value.timezone).filter(Boolean))],countries=[...new Set(origins.map(value=>value.country).filter(Boolean))],cities=[...new Set(origins.map(value=>value.city).filter(Boolean))];
 if(origins.length&&zones.length<=1&&countries.length<=1&&cities.length<=1){
  const timezone=zones[0]||known[countries[0]]?.timezone||null;
  const country=countries[0]||Object.keys(known).find(code=>known[code].timezone===timezone)||null;
  if(!country||!known[country]||!timezone||known[country].timezone===timezone)return {originCountry:country,originCity:cities[0]||null,originTimezone:timezone};
 }
 // Explicit origin fields are second choice. Trip departure_* is at the destination.
 const country=countryCode(state.trip.origin_country),timezone=validTimezone(state.trip.origin_timezone)||known[country]?.timezone||null;
 return {originCountry:country||null,originCity:text(state.trip.origin_city),originTimezone:timezone};
}
export const savedOriginTimezone=state=>savedOrigin(state).originTimezone;
export function timezoneFacts(context){
 const zone=validTimezone(context.timezone),origin=validTimezone(context.originTimezone),start=Date.parse(context.startDate+'T12:00:00Z'),end=Date.parse((context.endDate||context.startDate)+'T12:00:00Z');
 if(!zone||!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>730*86400000)return [];
 const formatter=timezone=>new Intl.DateTimeFormat('en-GB',{timeZone:timezone,timeZoneName:'longOffset'}),destFormatter=formatter(zone),originFormatter=origin?formatter(origin):null;
 const offset=(format,date)=>{const text=format.formatToParts(date).find(part=>part.type==='timeZoneName').value,match=text.match(/GMT([+-])(\d{2}):(\d{2})/);return match?(match[1]==='-'?-1:1)*(Number(match[2])*60+Number(match[3])):0;};
 const groups=[];for(let time=start;time<=end;time+=86400000){const date=new Date(time),minutes=offset(destFormatter,date),difference=originFormatter?minutes-offset(originFormatter,date):null,last=groups.at(-1);if(last&&last.minutes===minutes&&last.difference===difference)last.end=date;else groups.push({start:date,end:date,minutes,difference});}
 const label=context.cities?.[0]||countryName(context.primaryCountry||context.countries?.[0])||'Destination',originLabel=context.originCity|| (context.originCountry?countryName(context.originCountry):`departure (${origin})`);
 const dateLabel=date=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(date);
 const utc=minutes=>`UTC${minutes<0?'-':'+'}${String(Math.floor(Math.abs(minutes)/60)).padStart(2,'0')}:${String(Math.abs(minutes)%60).padStart(2,'0')}`;
 const facts=[];for(const group of groups){const range=group.start.getTime()===group.end.getTime()?dateLabel(group.start):`${dateLabel(group.start)}–${dateLabel(group.end)}`,name=new Intl.DateTimeFormat('en-GB',{timeZone:zone,timeZoneName:'long'}).formatToParts(group.start).find(part=>part.type==='timeZoneName').value;
  const abbreviation=zone==='Asia/Tokyo'?'JST':['Europe/Chisinau','Europe/Bucharest'].includes(zone)?group.minutes===180?'EEST':'EET':new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'short'}).formatToParts(group.start).find(part=>part.type==='timeZoneName').value;
  facts.push(`${label}: ${name} (${abbreviation}; ${zone}), ${utc(group.minutes)} — ${range}.`);
  if(origin){const difference=group.difference,hours=Math.abs(difference)/60,shift=(9*60+difference+1440)%1440,clock=`${String(Math.floor(shift/60)).padStart(2,'0')}:${String(shift%60).padStart(2,'0')}`,day=9*60+difference<0?' (previous day)':9*60+difference>=1440?' (next day)':'';
   facts.push(`${range}: ${label} is ${hours===0?'on the same time as':`${hours} hours ${difference>0?'ahead of':'behind'}`} ${originLabel}. 09:00 there → ${clock}${day} in ${label}.`);
  }
 }
 if(groups.length>1)facts.push('The date ranges above account for UTC-offset/daylight-saving changes during your trip.');
 if(!origin)facts.push('Add your departure city to see the time difference.');
 return facts.map(text=>({text,sourceType:'calculated',computedBy:'intl-date-offsets',sourceUrl:null,verifiedAt:null,checkedAt:null}));
}
