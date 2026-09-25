import { preserveMealChoices } from './meal-context.js';
import { mealChoice } from '../src/lib/dining.js';
import { createHash, randomUUID } from 'node:crypto';
import { transaction } from './db.js';
import { owned, insertRecord } from './entities.js';
import { serialize, validateData } from './schema.js';
import { assert } from './errors.js';
import { provider } from './ai.js';
import { proposeItinerary } from './itinerary-ai.js';
import { scheduleItinerary, tripDates, minute, selectedPlaces, isRequiredPlace, SCHEDULER_VERSION } from './itinerary-engine.js';
import { withBookingLinks } from './referrals.js';
import { samePlace } from '../src/lib/place-matching.js';
import {scheduleWithProviders,prepareScheduling} from './scheduling-data.js';

export async function snapshot(db, tripId, ownerId, lock = false) {
  const trip = serialize('Trip', await owned(db, 'Trip', tripId, ownerId, lock));
  const load = async (table, name) => {
    const [rows] = await db.execute(`SELECT * FROM ${table} WHERE trip_id=? AND owner_id=? ORDER BY id`, [tripId, ownerId]);
    return rows.map(row => serialize(name, row));
  };
  return { trip, places: await load('place_selections', 'PlaceSelection'), tripItems: await load('trip_items', 'TripItem'), dayWindows: await load('day_windows', 'DayWindow'), items: await load('itinerary_items', 'ItineraryItem') };
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function clean(record, newOptional = []) {
  const ignored = new Set(['created_date','updated_date','created_by_id','planning_step','plan_status','plan_version','last_validated_at','itinerary_meta','share_enabled','share_hide_stay','share_token','arrival_ticket_url','departure_ticket_url','reservation_file_url','airline','traveler']);
  return Object.fromEntries(Object.entries(record).filter(([key,value]) => !ignored.has(key) && !(newOptional.includes(key) && value == null)).sort(([a], [b]) => a.localeCompare(b)));
}
const optionalLocations = ['arrival','departure'].flatMap(direction => ['place_id','address','city','country','lat','lng'].map(field => `${direction}_${field}`));
export const inputHash = state => digest({ trip: clean(state.trip, [...optionalLocations,'special_wishes','food_preferences','dining_budget','dietary_notes']), places: state.places.map(item => clean(item)), tripItems: state.tripItems.filter(item=>['stay','flight'].includes(item.category)||item.category==='place'&&(item.ticket_purchased||item.booking_status==='confirmed')).map(item => clean(item, ['city','country'])), dayWindows: state.dayWindows.map(item => clean(item)) });
export const revision = state => digest({ inputs: inputHash(state), version: state.trip.plan_version || 0, items: state.items });
export const optionalPlaces = (state, items) => selectedPlaces(state).places.filter(place => !isRequiredPlace(place) && !items.some(item => item.selection_id === place.id)).map(place => ({ selection_id: place.id, name: place.name, category: place.category || null, reason: 'available_time' }));
export function unscheduledPlaces(state) {
  let meta={};try{meta=JSON.parse(state.trip.itinerary_meta||'{}');}catch{}
  return selectedPlaces(state).places.filter(place=>!state.items.some(item=>item.selection_id===place.id)).map(place=>{
    const required=isRequiredPlace(place),saved=(meta.unscheduled_optional||[]).find(row=>row.selection_id===place.id);
    return {selection_id:place.id,name:place.name,required,reason:required?'Needs another available time.':saved?.reason==='available_time'?'Could not fit into the current schedule.':'Saved for a later opportunity.'};
  }).sort((a,b)=>Number(b.required)-Number(a.required)||a.name.localeCompare(b.name));
}
const metadata = trip => { try { return JSON.parse(trip.itinerary_meta || '{}'); } catch { return {}; } };
export async function present(state) {
  const meta = metadata(state.trip);
  let dates;
  try { dates = tripDates(state.trip); } catch { dates = [...new Set(state.items.map(item => item.date))].sort(); }
  dates = [...new Set([...dates,...state.items.map(item=>item.date)])].sort();
  return { mealChoicesToReview: meta.unplaced_meal_choices || [], unscheduledSelected: unscheduledPlaces(state), unscheduledOptional: optionalPlaces(state,state.items), requiresRegeneration: Boolean(state.items.length && (meta.scheduler_version || 1) < SCHEDULER_VERSION), items: await withBookingLinks(state.trip, [...state.items].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))), dates,
    version: state.trip.plan_version || 0, conflicts: meta.conflicts || [], generation: meta.generation || 'legacy', message: meta.message || '',
    totalActivityCost: meta.totalActivityCost || 0, budgetExceeded: meta.budgetExceeded || false, stale: Boolean(meta.input_hash && meta.input_hash !== inputHash(state)) };
}
export async function readItinerary(tripId, ownerId) { return present(await transaction(db => snapshot(db, tripId, ownerId))); }
export async function persist(db, state, result, meta, affected = null) {
  preserveMealChoices(state,result.items);
  if (affected) await db.execute(`DELETE FROM itinerary_items WHERE trip_id=? AND owner_id=? AND date IN (${affected.map(() => '?').join(',')})`, [state.trip.id, state.trip.created_by_id, ...affected]);
  else await db.execute('DELETE FROM itinerary_items WHERE trip_id=? AND owner_id=?', [state.trip.id, state.trip.created_by_id]);
  for (const item of result.items) await insertRecord(db, 'ItineraryItem', item, state.trip.created_by_id, {internal:true});
  const allItems = affected ? [...state.items.filter(item=>!affected.includes(item.date)),...result.items] : result.items;
  const lostChoices=[...(metadata(state.trip).unplaced_meal_choices||[]),...state.items.filter(item=>item.step_type==='meal'&&mealChoice(item)).map(item=>({date:item.date,...mealChoice(item)}))].filter(choice=>!allItems.some(item=>item.date===choice.date&&mealChoice(item)?.place_id===choice.place_id));
  const info = { scheduler_version: affected ? (metadata(state.trip).scheduler_version || 1) : SCHEDULER_VERSION, unscheduled_optional: optionalPlaces(state,allItems), generation: meta.generation, message: meta.message, input_hash: inputHash(state), conflicts: result.conflicts, totalActivityCost: result.totalActivityCost, budgetExceeded: result.budgetExceeded };
  info.unplaced_meal_choices=[...new Map(lostChoices.map(choice=>[choice.date+'|'+choice.place_id,choice])).values()];
  await db.execute('UPDATE trips SET plan_status=?,plan_version=?,last_validated_at=?,itinerary_meta=? WHERE id=? AND owner_id=?', [result.conflicts.length ? 'needs_verification' : 'calculated', result.version, new Date().toISOString(), JSON.stringify(info), state.trip.id, state.trip.created_by_id]);
}
export async function generateItinerary(tripId, ownerId, body = {}) {
  const initial = await transaction(db => snapshot(db, tripId, ownerId));
  assert(initial.trip.destination?.trim(), 400, 'Add a destination first.');
  tripDates(initial.trip);
  assert(initial.places.length <= 200, 400, 'Generate itineraries with up to 200 selected places. Your saved data has not changed.');
  if (initial.items.length) assert(body.expected_version === (initial.trip.plan_version || 0), 409, 'An itinerary already exists. Reload it before explicitly regenerating.');
  const before = revision(initial);
  const proposal = body.use_ai === true ? await proposeItinerary(initial, provider) : { visits: [], generation: 'local', message: 'Generated locally from your saved plan. Travel times and opening hours need verification.' };
  const prepared=await prepareScheduling(initial);
  let result = await scheduleWithProviders(initial, proposal.visits, null, {preferredWindows:proposal.preferredWindows,prepared});
  const mandatory=selectedPlaces(initial).places.filter(isRequiredPlace);
  const missed=mandatory.filter(place=>!result.items.some(item=>item.selection_id===place.id));
  if(missed.length&&proposal.preferredWindows?.length){
    // AI-added free time is soft. Never let it erase a mandatory visit that fits the user's own hours.
    const relaxed=proposal.preferredWindows.filter(day=>!missed.some(place=>!place.fixed_date||place.fixed_date===day.date));
    const repaired=await scheduleWithProviders(initial,proposal.visits,null,{preferredWindows:relaxed,prepared});
    const score=plan=>mandatory.filter(place=>plan.items.some(item=>item.selection_id===place.id)).length;
    if(score(repaired)>score(result)){result=repaired;proposal.preferredWindows=relaxed;proposal.message+=' Some AI-suggested free time was relaxed to preserve your mandatory places within your saved planning hours.';}
  }
  if (proposal.visits.length) {
    const fallback = await scheduleWithProviders(initial, [], null, {preferredWindows:proposal.preferredWindows,prepared});
    const score=plan=>mandatory.filter(place=>plan.items.some(item=>item.selection_id===place.id)).length*1000+plan.items.filter(item=>item.step_type==='visit').length;
    if (score(fallback) > score(result)) {
      result = fallback; proposal.generation = 'local'; proposal.message = 'The AI route left more selected places unscheduled; local scheduling preserved more visits.';
    }
  }
  await transaction(async db => {
    const current = await snapshot(db, tripId, ownerId, true);
    assert(revision(current) === before, 409, 'The plan changed while generating. Reload and retry; your newer changes were preserved.');
    await persist(db, current, result, proposal);
  });
  return readItinerary(tripId, ownerId);
}
export async function editItinerary(tripId, ownerId, body) {
  const initial=await transaction(db=>snapshot(db,tripId,ownerId)),prepared=await prepareScheduling(initial);
  await transaction(async db => {
    const state = await snapshot(db, tripId, ownerId, true);
    assert(revision(state)===revision(initial),409,'This itinerary changed in another session. Reload it before editing.');
    assert(Number.isInteger(body.expected_version) && body.expected_version === (state.trip.plan_version || 0), 409, 'This itinerary changed. Reload it before editing.');
    const target = state.items.find(item => item.id === body.item_id && item.step_type === 'visit');
    assert(target, 404, 'Visit not found.');
    const dates = tripDates(state.trip);
    assert(!metadata(state.trip).input_hash || metadata(state.trip).input_hash === inputHash(state), 409, 'Planning inputs changed. Regenerate the itinerary before editing its visits.');
    assert(dates.includes(body.date), 400, 'Choose a day within the trip dates.');
    assert(typeof body.name === 'string' && body.name.trim().length > 0 && body.name.length <= 200, 400, 'Enter a place name (up to 200 characters).');
    assert(typeof body.address === 'string' && body.address.length <= 400, 400, 'Enter a valid address.');
    assert(Number.isInteger(body.duration_min) && body.duration_min >= 15 && body.duration_min <= 480, 400, 'Duration must be 15–480 minutes.');
    assert(!body.start_time || minute(body.start_time) !== null, 400, 'Choose a valid local time.');
    const legacyMatches = state.places.filter(place => place.name === target.title && place.priority !== 'excluded');
    const old = state.places.find(place => place.id === target.selection_id) || (!target.selection_id && legacyMatches.length === 1 ? legacyMatches[0] : null);
    const replacement = body.name.trim() !== target.title || body.address !== (target.address || target.location || '');
    const changed = { ...(old || {}), id: old?.id || randomUUID(), trip_id: tripId, name: body.name.trim(), address: body.address,
      priority: old?.priority === 'mandatory' ? 'mandatory' : 'preferred', desired_duration_min: body.duration_min, fixed_date: body.date,
      fixed_time: body.start_time || null, selection_source: replacement ? 'manual' : old?.selection_source || 'manual' };
    if (!replacement) changed.notes = target.notes || old?.notes || null;
    if (replacement) Object.assign(changed, { place_id: null, lat: null, lng: null, city: null, country: null, category: null, ticket_type: null, ticket_purchased: false, entry_time: null, source_url: null, image_url: null, fit_reason: null, notes: null, status: 'unresolved' });
    assert(!state.places.some(place => place.id !== changed.id && samePlace(place, changed)), 400, 'This place is already selected or excluded. Edit that existing place instead.');
    const data = validateData('PlaceSelection', changed);
    if (old) await db.execute(`UPDATE place_selections SET ${Object.keys(data).map(key => `\`${key}\`=?`).join(',')} WHERE id=? AND owner_id=?`, [...Object.values(data), old.id, ownerId]);
    else await insertRecord(db, 'PlaceSelection', changed, ownerId, { id: changed.id });
    state.places = [...state.places.filter(place => place.id !== changed.id), changed];
    const affected = [...new Set([target.date, body.date])];
    const retained = state.items.filter(item => !affected.includes(item.date));
    const participants = [];
    for (const item of state.items.filter(item => affected.includes(item.date) && item.step_type === 'visit' && item.id !== target.id)) {
      let place = state.places.find(place => place.id === item.selection_id);
      if (!place) {
        place = state.places.find(candidate => candidate.name === item.title && !participants.some(p => p.id === candidate.id));
        if (!place) { place = await insertRecord(db, 'PlaceSelection', { trip_id: tripId, name: item.title, address: item.location, priority: 'preferred', desired_duration_min: item.duration_min, ticket_type: item.ticket_type, ticket_purchased: item.ticket_status === 'purchased', source_url: item.source_url }, ownerId); state.places.push(place); }
      }
      participants.push({ ...place, notes: item.notes || place.notes, fixed_date: item.date, fixed_time: place.fixed_time || null });
    }
    participants.push({...changed,_requested_time:Boolean(body.start_time&&!old?.fixed_time&&!old?.ticket_purchased)});
    const hints = state.items.filter(item => item.step_type === 'visit' && affected.includes(item.date)).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)).map(item => ({ selection_id: item.selection_id, date: item.date, preferred_start: '', reason: '' }));
    const result = scheduleItinerary({ ...state, places: participants.map(p=>({...p,__hours:prepared.places.find(saved=>saved.id===p.id&&saved.place_id===p.place_id)?.__hours})),tripItems:prepared.tripItems }, hints, affected);
    assert(result.items.some(item => item.selection_id === changed.id && item.date === body.date), 400, 'The edited visit does not fit or conflicts with an exclusion. Adjust the time, duration or daily window. No changes were saved.');
    assert(participants.every(place => result.items.some(item => item.selection_id === place.id)), 400, 'This change would displace another visit. Adjust the daily window or regenerate the full plan. No changes were saved.');
    const previousMeta = metadata(state.trip);
    result.conflicts = [...(previousMeta.conflicts || []).filter(conflict => !affected.includes(conflict.date)&&!(conflict.code==='required_unscheduled'&&result.items.some(item=>item.selection_id===conflict.selection_id))), ...result.conflicts];
    result.totalActivityCost += retained.reduce((sum, item) => sum + (item.cost || 0), 0);
    result.budgetExceeded = state.trip.budget_activities > 0 && result.totalActivityCost > state.trip.budget_activities;
    const updatedState = await snapshot(db, tripId, ownerId);
    await persist(db, updatedState, result, { generation: 'edited', message: 'Edited locally. Only the affected days were recalculated; verify transfer estimates.' }, affected);
  });
  return readItinerary(tripId, ownerId);
}
