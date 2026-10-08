import {pool} from '../db.js';
import {owned} from '../entities.js';
import {serialize} from '../schema.js';
import {tripWeather} from './service.js';

export async function readWeatherState(db,tripId,ownerId) {
  const trip=serialize('Trip',await owned(db,'Trip',tripId,ownerId));
  const load=async(table,name,order='id')=>{const [rows]=await db.execute(`SELECT * FROM ${table} WHERE trip_id=? AND owner_id=? ORDER BY ${order}`,[tripId,ownerId]);return rows.map(row=>serialize(name,row));};
  const [items,stays,selections]=await Promise.all([load('itinerary_items','ItineraryItem','date,sort_order'),load('trip_items','TripItem'),load('place_selections','PlaceSelection')]);
  return {trip,items,stays,selections};
}
export async function getTripWeather(req,res) {
  const state=await readWeatherState(pool,req.params.id,req.user.id);
  res.set('Cache-Control','private, no-store').json(await tripWeather(state));
}
