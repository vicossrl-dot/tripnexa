import { parseWindows, subtractBlocked } from '../src/lib/planningEngine.js';
import { violatesExclusions } from './planning-suggestions.js';
import { samePlace } from '../src/lib/place-matching.js';
import { assert } from './errors.js';
import { localMinute, datedEvent, eventInterval } from './itinerary-time.js';
import { buildLogistics, validateSchedule } from './itinerary-logistics.js';
import {openingStart,openingWindows,hoursNote} from './place-hours.js';
import {routeKey} from './route-data.js';
export const isRequiredPlace = place => Boolean(place.ticket_purchased || place.fixed_time || place.priority === 'mandatory' || ['manual','google'].includes(place.selection_source));
export const SCHEDULER_VERSION = 3;

export const minute = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : null;
const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const numeric = (value, fallback, max = 480) => value == null ? fallback : Math.max(0, Math.min(max, Number(value) || 0));
export function tripDates(trip) {
  const start = Date.parse(trip.start_date), end = Date.parse(trip.end_date);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(trip.start_date || '') && /^\d{4}-\d{2}-\d{2}$/.test(trip.end_date || '') && Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 365 * 86400000, 400, 'Choose valid trip dates, up to one year apart.');
  return Array.from({ length: Math.round((end - start) / 86400000) + 1 }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
}
function distance(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(value => value != null && Number.isFinite(Number(value)))) return null;
  const radians = Math.PI / 180;
  const x = (b.lng - a.lng) * radians * Math.cos((a.lat + b.lat) / 2 * radians);
  const y = (b.lat - a.lat) * radians;
  return Math.sqrt(x * x + y * y) * 6371;
}
export function movement(trip, from, to, walked = 0) {
  const km = distance(from, to);
  const walk = km == null ? 30 : Math.max(5, Math.ceil(km * 1.4 / 4 * 60));
  const maxSegment = numeric(trip.max_walk_per_segment_min, 30, 1440);
  const maxDay = numeric(trip.max_walk_per_day_min, 120, 1440);
  const requested = trip.transport_preference || (trip.travel_type === 'car' ? 'car' : 'transit');
  const constrained = Boolean(trip.mobility_needs?.trim() || trip.stroller);
  const canWalk = !constrained && km != null && walk <= maxSegment && walked + walk <= maxDay;
  let mode = requested === 'walk' ? (canWalk ? 'walk' : 'transit') : requested === 'mixed' ? (canWalk ? 'walk' : 'transit') : requested;
  const lookup=selected=>{const key=routeKey(from,to,selected);if(key)trip.__routeRequests?.set(key,{from,to,mode:selected});return key?trip.__routes?.get(key):null;};
  let live=lookup(mode);
  if(mode==='walk'&&live&&(live.minutes>maxSegment||walked+live.minutes>maxDay)){mode='transit';live=lookup(mode);}
  return { mode, minutes: live?.minutes??(mode === 'walk' ? walk : km == null ? 30 : Math.max(10, Math.ceil(km * 1.4 / (mode === 'transit' ? 18 : 25) * 60) + (mode === 'transit' ? 10 : 5))), source:live?'google':'estimated', changed: requested === 'walk' && mode !== 'walk' };
}
export function hotelFor(items, date, fallback) {
  const stays = items.filter(item => item.category === 'stay' && (!item.date || item.date <= date) && (!item.end_date || item.end_date >= date));
  return stays.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || { title: fallback || 'Accommodation to confirm', address: fallback || 'Accommodation to confirm' };
}
const label = place => place.address || place.name || place.title || 'Location to confirm';
export function selectedPlaces(snapshot) {
  const result = [], conflicts = [];
  for (const place of [...snapshot.places].sort((a,b)=>Number(isRequiredPlace(b))-Number(isRequiredPlace(a)))) {
    if (!['mandatory', 'preferred'].includes(place.priority)) continue;
    const excluded = violatesExclusions(place, snapshot.trip.exclusions) || snapshot.places.some(other => other.priority === 'excluded' && samePlace(place, other));
    if (excluded || result.some(other => samePlace(place, other))) {
      conflicts.push({ place: place.name, date: place.fixed_date || '', reason: excluded ? 'Not scheduled because it conflicts with an exclusion. Review your preferences or this place.' : 'Duplicate selected place; only one visit is scheduled.' });
    } else {
      const booking=snapshot.tripItems.find(item=>item.category==='place'&&(item.id===place.trip_item_id||item.place_id&&item.place_id===place.place_id)&& (item.ticket_purchased||item.booking_status==='confirmed'));
      const confirmed=place.ticket_purchased||Boolean(booking);
      result.push({...place,...(confirmed?{ticket_purchased:true,fixed_date:booking?.date||place.fixed_date||null,fixed_time:booking?.entry_time||booking?.time||place.fixed_time||(minute(place.entry_time)!==null?place.entry_time:null)}: {})});
    }
  }
  return { places: result, conflicts };
}
export function scheduleItinerary(snapshot, proposal = [], onlyDates = null, options = {}) {
  const { trip, tripItems, dayWindows } = snapshot;
  const dates = tripDates(trip);
  const chosen = selectedPlaces(snapshot);
  const remaining = new Map(chosen.places.map(place => [place.id, place]));
  const logistics=buildLogistics({...snapshot,places:chosen.places},{movement,hotelFor});
  const conflicts = [...chosen.conflicts,...logistics.conflicts], items = logistics.items.filter(item=>!onlyDates||onlyDates.includes(item.date)), unscheduledOptional=[];
  const buffer = numeric(trip.buffer_min, 15, 120), meal = numeric(trip.meal_duration_min, 60, 180);
  const rest = trip.pace === 'relaxed' || trip.stroller || trip.mobility_needs ? 20 : trip.pace === 'intense' ? 5 : 10;
  const limit = trip.pace === 'relaxed' ? 3 : trip.pace === 'intense' ? 8 : 5;
  const hints = new Map(proposal.map((hint, index) => [hint.selection_id, { ...hint, index }]));
  for (const date of dates.filter(day => !onlyDates || onlyDates.includes(day))) {
    const day = dayWindows.find(window => window.date === date);
    let windows = day ? parseWindows(day.windows) : [{ start: '09:30', end: '18:30' }];
    const preferred=options.preferredWindows?.find(row=>row.date===date);
    if(preferred) windows=windows.flatMap(window=>preferred.windows.map(w=>({start:window.start>w.start?window.start:w.start,end:window.end<w.end?window.end:w.end})).filter(w=>w.end>w.start));
    const free = subtractBlocked(windows, parseWindows(day?.blocked)).map(window => ({ start: minute(window.start), end: minute(window.end) })).filter(window => window.start !== null && window.end !== null && window.end > window.start).sort((a, b) => a.start - b.start);
    // Merge overlaps so a malformed/overlapping window never schedules time twice.
    const intervals = [];
    for (const window of free) { const last = intervals.at(-1); if (last && window.start <= last.end) last.end = Math.max(last.end, window.end); else intervals.push({ ...window }); }
    const hotel = hotelFor(tripItems, date, day?.start_point || trip.destination);
    const startPoint = day?.start_point && day.start_point !== 'Hotel' ? { title: day.start_point } : hotel;
    const endPoint = day?.end_point && day.end_point !== 'Hotel' ? { title: day.end_point } : hotel;
    let point = startPoint, walked = 0, visits = 0, mealDone = meal === 0;
    const daily = [], dayBase=localMinute(date+'T00:00');
    const add = (type,title,start,end,extra={}) => {
      if(end<=start)return;
      daily.push(datedEvent(trip.id,type,title,dayBase+start,dayBase+end,extra));
    };
    const transfer = (from, to, start, route, title = null) => {
      add('transport', title || `${label(from)} → ${label(to)}`, start, start + route.minutes, { route_origin: label(from), route_destination: label(to), route_mode: route.mode, route_duration_min: route.minutes, source_status:route.source==='google'?'api_provided':'estimated', location: label(to), notes: `${route.source==='google'?'Google Maps route estimate; timetables and traffic may change.':'Estimated travel time; verify the route and accessibility.'}${route.changed ? ' Public transport suggested to respect walking limits; verify accessibility.' : ''}` });
      if (route.mode === 'walk') walked += route.minutes;
    };
    let lower=Math.max(intervals[0]?.start??570,logistics.availableAfter===null?-Infinity:logistics.availableAfter-dayBase+buffer);
    const upper=Math.min(intervals.at(-1)?.end??1110,logistics.leaveBefore===null?Infinity:logistics.leaveBefore-dayBase-buffer);
    const previousDate = dates[dates.indexOf(date) - 1];
    const prior = previousDate ? hotelFor(tripItems, previousDate, dayWindows.find(window => window.date === previousDate)?.start_point || trip.destination) : null;
    if (prior && label(prior) !== label(hotel) && lower < upper) {
      const route = movement(trip, prior, hotel);
      transfer(prior, hotel, lower, route, 'Transfer to next stay'); lower += route.minutes + buffer;
    }
    const reserveInterval=(start,end)=>{
      const cut=[];for(const window of intervals){if(window.end<=start||window.start>=end)cut.push(window);else{if(window.start<start)cut.push({start:window.start,end:start});if(window.end>end)cut.push({start:end,end:window.end});}}
      intervals.splice(0,intervals.length,...cut);
    };
    for(const item of [...logistics.items,...items.filter(item=>!logistics.items.includes(item)),...(onlyDates?(snapshot.items||[]).filter(item=>!onlyDates.includes(item.date)):[])]){
      const span=eventInterval(item);if(span.start<dayBase+1440&&span.end>dayBase)reserveInterval(Math.max(0,span.start-dayBase),Math.min(1440,span.end-dayBase+buffer));
    }
    // Protect timed reservations before fitting flexible visits into planning hours.
    // Their exact time remains visible even if the user narrowed or blocked that window.
    for(const place of [...remaining.values()].filter(p=>p.fixed_date===date&&minute(p.fixed_time)!==null)){
      const start=minute(place.fixed_time),duration=Math.max(15,numeric(place.desired_duration_min,120)),finish=start+duration;
      const opening=openingWindows(place.__hours,date);
      if(opening!==null&&!opening.some(w=>start>=w.start&&finish<=w.end))conflicts.push({code:'booking_hours',place:place.name,date,reason:'This booking time conflicts with the currently available place information. Please verify the reservation.'});
      const route=movement(trip,hotel,place,walked),back=movement(trip,place,hotel,walked+(route.mode==='walk'?route.minutes:0));
      const reservedStart=start-route.minutes-buffer,reservedEnd=finish+back.minutes+buffer;
      if(place._requested_time && !intervals.some(window=>reservedStart>=Math.max(window.start,lower)&&reservedEnd<=Math.min(window.end,upper)))continue;
      transfer(hotel,place,reservedStart,route);
      if(buffer)add('access','Arrival buffer',start-buffer,start,{location:label(place)});
      add('visit',place.name,start,finish,{selection_id:place.id,location:label(place),address:place.address||null,place_id:place.place_id||null,lat:place.lat??null,lng:place.lng??null,locked:!place._requested_time,ticket_type:place.ticket_type||null,ticket_status:place.ticket_purchased?'purchased':place.ticket_type==='none'?'free':place.ticket_type?'needed':'to_verify',source_url:place.source_url||null,cost:place.estimated_cost||0,currency:trip.currency,notes:place._requested_time?'Time adjusted for your itinerary change. Verify opening hours and access.':'Fixed-time visit. Confirm opening hours and access with the operator.'});
      transfer(place,hotel,finish,back);remaining.delete(place.id);visits++;
      reserveInterval(reservedStart,reservedEnd);
    }
    const futureFixed = () => [...remaining.values()].filter(place => (!place.fixed_date || place.fixed_date === date) && place.fixed_time).sort((a, b) => minute(a.fixed_time) - minute(b.fixed_time));
    for (const window of intervals) {
      let cursor = Math.max(window.start, lower);
      const end = Math.min(window.end, upper);
      while (cursor < end) {
        if (!mealDone && cursor >= 12 * 60 && cursor + meal + (point===endPoint?0:movement(trip,point,endPoint,walked).minutes) <= end && !futureFixed().some(place => minute(place.fixed_time) < cursor + meal + 45 + buffer)) {
          add('meal', 'Meal break', cursor, cursor + meal, { location: label(point) }); cursor += meal; mealDone = true; continue;
        }
        const fixed = futureFixed().find(place => minute(place.fixed_time) >= cursor && minute(place.fixed_time) < end);
        const flexible = [...remaining.values()].filter(place => !place.fixed_time && (!place.fixed_date || place.fixed_date === date) && (!hints.get(place.id)?.date || hints.get(place.id).date <= date));
        flexible.sort((a, b) => Number(isRequiredPlace(b))-Number(isRequiredPlace(a)) || (distance(point,a)??10000)-(distance(point,b)??10000) || Number(!String(trip.interests||'').toLowerCase().includes(a.category||'__'))-Number(!String(trip.interests||'').toLowerCase().includes(b.category||'__')) || (hints.get(a.id)?.index??10000)-(hints.get(b.id)?.index??10000));
        let selected = null, route, start, duration;
        for (const candidate of [...flexible, ...(fixed ? [fixed] : [])]) {
          if (!isRequiredPlace(candidate) && visits >= limit) continue;
          const travel = movement(trip, point, candidate, walked);
          const visitDuration = Math.max(15, numeric(candidate.desired_duration_min, 120));
          const fixedStart = candidate.fixed_time ? minute(candidate.fixed_time) : null;
          const preferredStart = hints.get(candidate.id)?.date===date ? minute(hints.get(candidate.id)?.preferred_start) : null;
          let visitStart = fixedStart ?? Math.max(cursor + travel.minutes + buffer, preferredStart ?? 0);
          if(fixedStart===null){visitStart=openingStart(candidate.__hours,date,visitStart,visitDuration);if(visitStart===null)continue;}
          const back = movement(trip, candidate, endPoint, walked + (travel.mode === 'walk' ? travel.minutes : 0));
          const deadline = fixed && candidate !== fixed ? Math.min(end, minute(fixed.fixed_time) - 60 - buffer) : end;
          const laterMealSlot = intervals.some(later => later.start >= end && Math.min(later.end, upper) - Math.max(later.start, lower, 12 * 60) >= meal);
          const mealBeforeVisit=Math.max(cursor,12*60)+meal<=visitStart-travel.minutes-buffer;
          let reserveMeal = mealDone || laterMealSlot || mealBeforeVisit ? 0 : meal;
          // Preferred AI times are hints, not new reservations. Retry earlier before dropping a fitting visit.
          if(fixedStart===null && visitStart + visitDuration + rest + buffer + back.minutes + reserveMeal > deadline){visitStart=openingStart(candidate.__hours,date,cursor+travel.minutes+buffer,visitDuration);if(visitStart===null)continue;reserveMeal=mealDone||laterMealSlot?0:meal;}
          if (visitStart < cursor + travel.minutes + buffer || visitStart + visitDuration + rest + buffer + back.minutes + reserveMeal > deadline) continue;
          selected = candidate; route = travel; start = visitStart; duration = visitDuration; break;
        }
        if (!selected) {
          const mealStart = Math.max(cursor, 12 * 60);
          if (!mealDone && mealStart + meal + (point===endPoint?0:movement(trip,point,endPoint,walked).minutes) <= end) {
            if (mealStart > cursor) add('free', 'Free time / rest', cursor, mealStart, { location: label(point) });
            add('meal', 'Meal break', mealStart, mealStart + meal, { location: label(point) }); cursor = mealStart + meal; mealDone = true; continue;
          }
          break;
        }
        if(!mealDone&&Math.max(cursor,12*60)+meal<=start-route.minutes-buffer){
          const mealStart=Math.max(cursor,12*60);if(mealStart>cursor)add('free','Free time / rest',cursor,mealStart,{location:label(point)});
          add('meal','Meal break',mealStart,mealStart+meal,{location:label(point)});cursor=mealStart+meal;mealDone=true;
        }
        if (start - route.minutes - buffer > cursor) add('free', 'Free time / rest', cursor, start - route.minutes - buffer, { location: label(point) });
        transfer(point, selected, start - route.minutes - buffer, route);
        if (buffer) add('access', 'Arrival buffer', start - buffer, start, { location: label(selected) });
        add('visit', selected.name, start, start + duration, { selection_id: selected.id, location: label(selected), address: selected.address || null, place_id: selected.place_id || null, lat: selected.lat ?? null, lng: selected.lng ?? null, locked: Boolean(selected.fixed_time), ticket_type: selected.ticket_type || null,
          ticket_status: selected.ticket_purchased ? 'purchased' : selected.ticket_type === 'none' ? 'free' : selected.ticket_type ? 'needed' : 'to_verify', source_url: selected.source_url || null,
          cost: selected.estimated_cost || 0, currency: trip.currency, notes: [selected.notes, hints.get(selected.id)?.reason, hoursNote(selected.__hours)].filter(Boolean).join(' ') });
        cursor = start + duration;
        add('break', 'Rest / time buffer', cursor, cursor + rest + buffer, { location: label(selected) }); cursor += rest + buffer;
        remaining.delete(selected.id); point = selected; visits++;
      }
      const back = movement(trip, point, endPoint, walked);
      if (point !== endPoint && cursor + back.minutes <= end) { transfer(point, endPoint, cursor, back); cursor += back.minutes; point = endPoint; }
      if (cursor < end) add('free', 'Free time / flexible plans', cursor, end, { location: label(point) });
    }
    // Do not fabricate placeholder events when the day is unavailable.
    if (visits > limit) conflicts.push({ place: 'Daily pace', date, reason: 'Mandatory visits exceed the preferred daily pace. Consider moving a visit to another day.' });
    daily.sort((a, b) => a.start_time.localeCompare(b.start_time));
    items.push(...daily.map((item, index) => ({ ...item, sort_order: index, version: (trip.plan_version || 0) + 1 })));
  }
  for (const place of remaining.values()) {
    if(isRequiredPlace(place))conflicts.push({code:'required_unscheduled',selection_id:place.id,place:place.name,date:place.fixed_date||'',reason:'This must-see place does not fit your available hours and fixed plans. Choose another day, shorten the visit or adjust planning hours.'});
    else unscheduledOptional.push({selection_id:place.id,name:place.name,category:place.category||null,reason:'available_time'});
  }
  for(const item of items.filter(item=>item.step_type==='visit')) {
    const place=chosen.places.find(p=>p.id===item.selection_id);
    if(place&&!place.address&&!place.place_id)conflicts.push({code:'unresolved_location',selection_id:place.id,place:place.name,date:item.date,reason:'Confirm the address of this place in Desired places so its travel time can be checked.'});
  }
  for(const item of items.filter(item=>item.step_type==='visit')) {
    const span=eventInterval(item);
    if(logistics.availableAfter!==null&&span.start<logistics.availableAfter || logistics.leaveBefore!==null&&span.end>logistics.leaveBefore)
      conflicts.push({code:'journey_visit_conflict',selection_id:item.selection_id,place:item.title,date:item.date,reason:'This reservation is outside the time available between arrival and departure. Review its date or your journey times.'});
  }
  conflicts.push(...validateSchedule(items,dayWindows));
  items.sort((a,b)=>(a.start_datetime||a.date+'T'+a.start_time).localeCompare(b.start_datetime||b.date+'T'+b.start_time));
  items.forEach((item,index)=>{item.sort_order=index;item.version=(trip.plan_version||0)+1;});
  const totalActivityCost = items.reduce((total, item) => total + (item.cost || 0), 0);
  const budgetExceeded = trip.budget_activities > 0 && totalActivityCost > trip.budget_activities;
  if (budgetExceeded) conflicts.push({ place: 'Activity budget', date: '', reason: 'Known activity costs exceed the configured budget.' });
  return { items, conflicts:[...new Map(conflicts.map(c=>[(c.code||'')+'|'+c.place+'|'+c.date+'|'+c.reason,c])).values()], unscheduledOptional, schedulerVersion:SCHEDULER_VERSION, totalActivityCost, budgetExceeded, version: (trip.plan_version || 0) + 1 };
}
