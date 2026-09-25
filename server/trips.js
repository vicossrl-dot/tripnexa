import { mealChoice } from '../src/lib/dining.js';
import {readSettings} from './admin/settings.js';
import { Router } from 'express';
import { pool, transaction } from './db.js';
import { owned, insertRecord } from './entities.js';
import { serialize, validateData, entityTable } from './schema.js';
import { assert } from './errors.js';
import { secretToken } from './security.js';
import { rateLimit } from 'express-rate-limit';
import { readItinerary, generateItinerary, editItinerary } from './itinerary-service.js';
import { checkPrivateFiles } from './uploads.js';
import { previewChanges, applyChanges } from './itinerary-changes.js';
import { exportItineraryPdf } from './itinerary-pdf.js';
import {getAppUrls,buildShareUrl} from './app-urls.js';

export function publicProjection(trip, items) {
  const fields = ['name', 'destination', 'country', 'start_date', 'end_date', 'timezone', 'currency', 'plan_status', 'last_validated_at'];
  const publicTrip = Object.fromEntries(fields.map(key => [key, trip[key]]));
  const allowed = ['id', 'date', 'sort_order', 'step_type', 'title', 'start_time', 'end_time', 'start_datetime', 'end_datetime', 'duration_min', 'location', 'ticket_status', 'route_origin', 'route_destination', 'route_mode', 'route_duration_min'];
  const publicItems = items.filter(item => !trip.share_hide_stay || item.step_type !== 'access').map(item => {
    const result = Object.fromEntries(allowed.map(key => [key, item[key]]));
    const choice=mealChoice(item);
    if(item.step_type==='meal'&&choice&&!trip.share_hide_stay){result.title='Meal - '+choice.name;result.location=choice.address;result.restaurant={name:choice.name,category:choice.category,maps_url:choice.maps_url,needs_review:!!choice.needs_review};}
    result.notes = null;
    result.source_url = null;
    if (trip.share_hide_stay && item.step_type !== 'visit') {
      result.title = item.step_type === 'transport' ? 'Travel between stops' : item.step_type === 'meal' ? 'Meal break' : 'Scheduled break';
      result.location = null;
      result.route_origin = null;
      result.route_destination = null;
    }
    return result;
  });
  return { trip: publicTrip, items: publicItems };
}
export async function getSharedTrip(req, res) {
  assert(/^[A-Za-z0-9_-]{24,128}$/.test(req.params.token), 404, 'Trip not found.');
  const [trips] = await pool.execute('SELECT * FROM trips WHERE share_token=? AND share_enabled=TRUE', [req.params.token]);
  assert(trips[0], 404, 'Trip not found or sharing disabled.');
  const [items] = await pool.execute('SELECT * FROM itinerary_items WHERE trip_id=? ORDER BY date,sort_order', [trips[0].id]);
  const all=await readSettings();
  res.set('Cache-Control', 'no-store').json({...publicProjection(trips[0], items),affiliate_enabled:!!(all.features.referral_links&&all.settings.affiliate_public_enabled&&all.settings.affiliate_disclosure_text.trim())});
}
export const tripRouter = Router();
tripRouter.get('/:id/share-url',async(req,res)=>{const trip=await owned(pool,'Trip',req.params.id,req.user.id);res.json({url:trip.share_enabled&&trip.share_token?buildShareUrl(await getAppUrls(),trip.share_token):null});});
tripRouter.put('/:id/planning/:collection', async (req, res) => {
  const name = { places: 'PlaceSelection', windows: 'DayWindow', stays: 'TripItem' }[req.params.collection];
  assert(name, 404, 'Unknown planning collection.');
  assert(Array.isArray(req.body.items) && req.body.items.length <= 1000, 400, 'Expected up to 1000 items.');
  const result = await transaction(async db => {
    await owned(db, 'Trip', req.params.id, req.user.id, true);
    const table = entityTable(name);
    const stayClause = name === 'TripItem' ? " AND category='stay'" : '';
    const [existing] = await db.execute(`SELECT * FROM ${table} WHERE trip_id=? AND owner_id=?${stayClause}`, [req.params.id, req.user.id]);
    const known = new Set(existing.map(row => row.id));
    const kept = new Set();
    const result = [];
    for (const item of req.body.items) {
      assert(typeof item.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(item.id) && !kept.has(item.id), 400, 'Each planning item needs a unique ID.');
      kept.add(item.id);
      const input = { ...item, trip_id: req.params.id, ...(name === 'TripItem' ? { category: 'stay' } : {}) };
      if (known.has(item.id)) {
        const data = validateData(name, input);
        await checkPrivateFiles(db, data, req.user.id);
        if (name === 'PlaceSelection' && data.trip_item_id) {
          const linked = await owned(db, 'TripItem', data.trip_item_id, req.user.id, true);
          assert(linked.trip_id === req.params.id, 400, 'Linked item belongs to another trip.');
        }
        await db.execute(`UPDATE ${table} SET ${Object.keys(data).map(k => `\`${k}\`=?`).join(',')} WHERE id=? AND owner_id=?`, [...Object.values(data), item.id, req.user.id]);
        result.push(serialize(name, await owned(db, name, item.id, req.user.id)));
      } else result.push(await insertRecord(db, name, input, req.user.id, { id: item.id }));
    }
    if (name !== 'TripItem') for (const row of existing) {
      if (!kept.has(row.id)) await db.execute(`DELETE FROM ${table} WHERE id=? AND owner_id=?`, [row.id, req.user.id]);
    }
    return result;
  });
  res.json(result);
});
tripRouter.post('/:id/share', async (req, res) => {
  const { enabled, hideStay, regenerate } = req.body;
  assert(typeof enabled === 'boolean' && typeof hideStay === 'boolean' && (regenerate === undefined || typeof regenerate === 'boolean'), 400, 'Invalid sharing settings.');
  const trip = await transaction(async db => {
    const previous = await owned(db, 'Trip', req.params.id, req.user.id, true);
    const token = regenerate || !previous.share_token ? secretToken() : previous.share_token;
    await db.execute('UPDATE trips SET share_token=?,share_enabled=?,share_hide_stay=? WHERE id=? AND owner_id=?', [token, enabled, hideStay, req.params.id, req.user.id]);
    return serialize('Trip', await owned(db, 'Trip', req.params.id, req.user.id));
  });
  res.json(trip);
});
tripRouter.get('/:id/itinerary', async (req, res) => res.json(await readItinerary(req.params.id, req.user.id)));
const itineraryLimit = rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Please wait a minute before generating another itinerary.' } });
tripRouter.post('/:id/itinerary', itineraryLimit, async (req, res) => res.json(await generateItinerary(req.params.id, req.user.id, req.body || {})));
tripRouter.post('/:id/itinerary/edit', async (req, res) => res.json(await editItinerary(req.params.id, req.user.id, req.body || {})));
tripRouter.post('/:id/itinerary/preview', itineraryLimit, async(req,res)=>res.json(await previewChanges(req.params.id,req.user.id,req.body||{})));
tripRouter.post('/:id/itinerary/apply',async(req,res)=>res.json(await applyChanges(req.params.id,req.user.id,req.body?.token)));
tripRouter.get('/:id/itinerary/pdf',itineraryLimit,async(req,res)=>res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="TripSync-itinerary.pdf"','Cache-Control':'no-store'}).send(await exportItineraryPdf(req.params.id,req.user.id)));
