import { CUISINES } from '../src/lib/dining.js';
import { readFileSync } from 'node:fs';
import { assert } from './errors.js';

export const tables = {
  Trip: 'trips', TripItem: 'trip_items', PlaceSelection: 'place_selections',
  DayWindow: 'day_windows', ItineraryItem: 'itinerary_items',
  TodoBoard: 'todo_boards', TodoItem: 'todo_items',
};
export const schemas = Object.fromEntries([...Object.keys(tables), 'User'].map(name => [
  name, JSON.parse(readFileSync(new URL(`./schema/${name}.json`, import.meta.url), 'utf8')),
]));
export const metadata = new Set(['id', 'owner_id', 'created_date', 'updated_date', 'created_by', 'created_by_id', 'is_sample']);
export function entityTable(name) {
  assert(Object.hasOwn(tables, name), 404, 'Unknown entity.');
  return tables[name];
}
export function validateData(name, input, partial = false, internal = false) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 400, 'Expected an object.');
  const schema = schemas[name];
  assert(schema, 404, 'Unknown entity.');
  const data = {};
  for (const [key, value] of Object.entries(input)) {
    if (metadata.has(key)) continue;
    // Transient AI ambiguity hints never become database columns.
    if (name === 'PlaceSelection' && ['ambiguous', 'ambiguity_note'].includes(key)) continue;
    assert(Object.hasOwn(schema.properties, key), 400, `Unknown field: ${key}`);
    if (name === 'ItineraryItem' && key === 'meal_choice' && !internal) continue;
    if (name === 'Trip' && key === 'share_token' && !internal) continue;
    if (name === 'Trip' && key === 'itinerary_meta' && !internal) continue;
    const field = schema.properties[key];
    if (value === null || value === undefined || value === '') {
      data[key] = null;
      continue;
    }
    if (field.type === 'number') {
      assert((typeof value === 'number' || typeof value === 'string') && Number.isFinite(Number(value)), 400, `${key} must be a number.`);
      data[key] = Number(value);
      if (key === 'lat' || key.endsWith('_lat')) assert(Math.abs(data[key]) <= 90, 400, 'Invalid latitude.');
      if (key === 'lng' || key.endsWith('_lng')) assert(Math.abs(data[key]) <= 180, 400, 'Invalid longitude.');
      if (name === 'Trip' && key === 'destination_latitude') assert(Math.abs(data[key]) <= 90, 400, 'Invalid latitude.');
      if (name === 'Trip' && key === 'destination_longitude') assert(Math.abs(data[key]) <= 180, 400, 'Invalid longitude.');
      if (name === 'PlaceSelection' && key === 'lat') assert(Math.abs(data[key]) <= 90, 400, 'Invalid latitude.');
      if (name === 'PlaceSelection' && key === 'lng') assert(Math.abs(data[key]) <= 180, 400, 'Invalid longitude.');
    } else if (field.type === 'boolean') {
      assert(typeof value === 'boolean', 400, `${key} must be true or false.`);
      data[key] = value;
    } else {
      assert(typeof value === 'string' && value.length <= 60000, 400, `${key} must be text (at most 60,000 characters).`);
      if(key==='dietary_notes')assert(value.length<=1000,400,'Dietary needs must be at most 1,000 characters.');
      if(key==='food_preferences'){let list;try{list=JSON.parse(value);}catch{}assert(Array.isArray(list)&&list.length<=CUISINES.length&&new Set(list).size===list.length&&list.every(item=>CUISINES.includes(item)),400,'Choose valid cuisines.');}
      if (key === 'special_wishes') assert(value.length <= 4000, 400, 'Special wishes must be at most 4,000 characters.');
      assert(!field.enum || field.enum.includes(value), 400, `Invalid ${key}.`);
      if (field.format === 'date') {
        assert(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, 400, `Invalid ${key} date.`);
      }
      if (key.endsWith('_url') || key === 'url') {
        assert((value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) || /^https?:\/\//i.test(value), 400, `Invalid ${key} URL.`);
        assert(!/https?:\/\/([^/]*\.)?base44\.(com|app)([/:]|$)/i.test(value), 400, 'Import this hosted file into local storage first.');
      }
      if (key.endsWith('_id')) assert(value.length <= (key === 'place_id' || key.endsWith('_place_id') ? 255 : 64), 400, `${key} is too long.`);
      if (name === 'DayWindow' && ['windows', 'blocked'].includes(key)) {
        let windows;
        try { windows = JSON.parse(value); } catch { assert(false, 400, `Invalid ${key} JSON.`); }
        assert(Array.isArray(windows) && windows.every(w => w && /^\d{2}:\d{2}$/.test(w.start) && /^\d{2}:\d{2}$/.test(w.end)), 400, `Invalid ${key} intervals.`);
      }
      data[key] = value;
    }
  }
  for (const key of (schema.required || []).filter(Boolean)) {
    if (!partial || Object.hasOwn(data, key)) assert(data[key] !== null && data[key] !== undefined && String(data[key]).trim(), 400, `${key} is required.`);
  }
  if (!partial) for (const [key, field] of Object.entries(schema.properties)) {
    if (!Object.hasOwn(data, key) && Object.hasOwn(field, 'default')) data[key] = field.default;
  }
  return data;
}
export function serialize(name, row) {
  if (!row) return null;
  const result = { ...row };
  for (const [key, field] of Object.entries(schemas[name].properties)) {
    if (field.type === 'boolean' && result[key] != null) result[key] = Boolean(result[key]);
  }
  if (name === 'User') {
    const allowed=new Set(['id','email','created_date','updated_date',...Object.keys(schemas.User.properties)]);
    for(const key of Object.keys(result))if(!allowed.has(key))delete result[key];
    result.full_name = row.display_name || '';
    result.role = row.role || 'USER';
    result.status = row.status || 'ACTIVE';
  } else {
    result.created_by_id = result.owner_id;
    delete result.owner_id;
  }
  return result;
}
