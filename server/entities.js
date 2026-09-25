import { eventInterval, localStamp } from './itinerary-time.js';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { assert } from './errors.js';
import { entityTable, schemas, validateData, serialize } from './schema.js';
import { secretToken } from './security.js';
import { checkPrivateFiles } from './uploads.js';
import { walletFilesForRemoval, cleanupAfterRemoval } from './file-lifecycle.js';
import {runtimeSettings} from './admin/runtime.js';

export async function owned(db, name, id, ownerId, lock = false) {
  assert(typeof id === 'string' && id.length <= 64, 400, 'Invalid record ID.');
  const [rows] = await db.execute(`SELECT * FROM ${entityTable(name)} WHERE id=? AND owner_id=?${lock ? ' FOR UPDATE' : ''}`, [id, ownerId]);
  assert(rows[0], 404, 'Record not found.');
  return rows[0];
}
async function checkParent(db, name, data, ownerId) {
  await checkPrivateFiles(db, data, ownerId);
  if (schemas[name].properties.trip_id) {
    assert(data.trip_id, 400, 'trip_id is required.');
    await owned(db, 'Trip', data.trip_id, ownerId, true);
  }
  if (name === 'TodoItem') {
    assert(data.board_id, 400, 'board_id is required.');
    await owned(db, 'TodoBoard', data.board_id, ownerId, true);
  }
  if (name === 'PlaceSelection' && data.trip_item_id) {
    const item = await owned(db, 'TripItem', data.trip_item_id, ownerId, true);
    assert(item.trip_id === data.trip_id, 400, 'The selected item belongs to another trip.');
  }
  if (name === 'ItineraryItem' && data.selection_id) {
    const place = await owned(db, 'PlaceSelection', data.selection_id, ownerId, true);
    assert(place.trip_id === data.trip_id, 400, 'The selected place belongs to another trip.');
  }
}
export async function insertRecord(db, name, input, ownerId, options = {}) {
  const settings=runtimeSettings();
  if(name==='Trip'&&settings){await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[ownerId]);const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM trips WHERE owner_id=?',[ownerId]);assert(count.n<settings.quotas.trips_per_user,429,'Your trip limit has been reached.');}
  const data = validateData(name, input, false, options.internal);
  await checkParent(db, name, data, ownerId);
  const id = options.id || randomUUID();
  if (name === 'Trip' && data.share_enabled && !data.share_token) data.share_token = secretToken();
  const keys = Object.keys(data);
  await db.execute(`INSERT INTO ${entityTable(name)} (id,owner_id,${keys.map(k => `\`${k}\``).join(',')}) VALUES (${Array(keys.length + 2).fill('?').join(',')})`, [id, ownerId, ...Object.values(data)]);
  return serialize(name, await owned(db, name, id, ownerId));
}
export function querySpec(name, query, ownerId) {
  let filters;
  try { filters = query.filter ? JSON.parse(query.filter) : {}; } catch { assert(false, 400, 'Invalid filter.'); }
  assert(filters && typeof filters === 'object' && !Array.isArray(filters), 400, 'Invalid filter.');
  const allowed = new Set(['id', 'created_date', 'updated_date', ...Object.keys(schemas[name].properties)]);
  const clauses = ['owner_id=?'];
  const values = [ownerId];
  for (const [key, value] of Object.entries(filters)) {
    assert(allowed.has(key) && (value === null || ['string', 'number', 'boolean'].includes(typeof value)), 400, 'Invalid filter field or value.');
    clauses.push(value === null ? `\`${key}\` IS NULL` : `\`${key}\`=?`);
    if (value !== null) values.push(value);
  }
  const sort = String(query.sort || '-created_date');
  const key = sort.replace(/^-/, '');
  assert(allowed.has(key), 400, 'Invalid sort field.');
  const limit = Number(query.limit ?? 1000);
  assert(Number.isInteger(limit) && limit > 0 && limit <= 1000, 400, 'Limit must be between 1 and 1000.');
  return { where: clauses.join(' AND '), values, order: `\`${key}\` ${sort.startsWith('-') ? 'DESC' : 'ASC'}, id ASC`, limit, filters };
}
export const entityRouter = Router();
entityRouter.param('entity', (req, _res, next, name) => {
  try { entityTable(name); next(); } catch (error) { next(error); }
});
entityRouter.get('/:entity', async (req, res) => {
  const { entity } = req.params;
  const q = querySpec(entity, req.query, req.user.id);
  const [rows] = await pool.execute(`SELECT * FROM ${entityTable(entity)} WHERE ${q.where} ORDER BY ${q.order} LIMIT ${q.limit}`, q.values);
  res.json(rows.map(row => serialize(entity, row)));
});
entityRouter.get('/:entity/:id', async (req, res) => res.json(serialize(req.params.entity, await owned(pool, req.params.entity, req.params.id, req.user.id))));
entityRouter.post('/:entity/bulk', async (req, res) => {
  assert(Array.isArray(req.body.items) && req.body.items.length <= 1000, 400, 'Expected up to 1000 items.');
  const rows = await transaction(async db => {
    const result = [];
    for (const item of req.body.items) result.push(await insertRecord(db, req.params.entity, item, req.user.id));
    return result;
  });
  res.status(201).json(rows);
});
entityRouter.post('/:entity', async (req, res) => {
  const row = await transaction(db => insertRecord(db, req.params.entity, req.body, req.user.id));
  res.status(201).json(row);
});
export async function updateRecord(db, entity, id, input, ownerId) {
    const previous = await owned(db, entity, id, ownerId, true);
    const data = validateData(entity, input, true);
    for (const key of ['trip_id', 'board_id']) {
      assert(!Object.hasOwn(data, key) || data[key] === previous[key], 400, 'Moving records between parents is not supported.');
    }
    if (entity === 'ItineraryItem' && ['date','start_time','end_time'].some(key=>Object.hasOwn(data,key))) {
      const span=eventInterval({...previous,...data});
      if(span.start!==null&&span.end!==null&&span.end>span.start)Object.assign(data,{start_datetime:localStamp(span.start),end_datetime:localStamp(span.end),duration_min:span.end-span.start});
    }
    await checkParent(db, entity, { ...previous, ...data }, ownerId);
    if (entity === 'Trip' && data.share_enabled && !previous.share_token) data.share_token = secretToken();
    const keys = Object.keys(data);
    if (keys.length) await db.execute(`UPDATE ${entityTable(entity)} SET ${keys.map(k => `\`${k}\`=?`).join(',')} WHERE id=? AND owner_id=?`, [...Object.values(data), id, ownerId]);
    return serialize(entity, await owned(db, entity, id, ownerId));
}
entityRouter.patch('/:entity/:id', async (req, res) => {
  const { entity, id } = req.params;
  const row = await transaction(db => updateRecord(db, entity, id, req.body, req.user.id));
  res.json(row);
});
async function unlinkPlaces(db, ids, ownerId) {
  if (ids.length) await db.execute(`UPDATE place_selections SET trip_item_id=NULL WHERE owner_id=? AND trip_item_id IN (${ids.map(() => '?').join(',')})`, [ownerId, ...ids]);
}
entityRouter.delete('/:entity/:id', async (req, res) => {
  const files = await transaction(async db => {
    await owned(db, req.params.entity, req.params.id, req.user.id, true);
    const files = await walletFilesForRemoval(db, req.params.entity, [req.params.id], req.user.id);
    if (req.params.entity === 'TripItem') await unlinkPlaces(db, [req.params.id], req.user.id);
    await db.execute(`DELETE FROM ${entityTable(req.params.entity)} WHERE id=? AND owner_id=?`, [req.params.id, req.user.id]);
    return files;
  });
  await cleanupAfterRemoval(files);
  res.json({ ok: true });
});
entityRouter.delete('/:entity', async (req, res) => {
  const q = querySpec(req.params.entity, req.query, req.user.id);
  assert(Object.keys(q.filters).length, 400, 'A filter is required for bulk deletion.');
  const result = await transaction(async db => {
    const [matching] = await db.execute(`SELECT id FROM ${entityTable(req.params.entity)} WHERE ${q.where} FOR UPDATE`, q.values);
    const files = await walletFilesForRemoval(db, req.params.entity, matching.map(row => row.id), req.user.id);
    if (req.params.entity === 'TripItem') {
      const [rows] = await db.execute(`SELECT id FROM trip_items WHERE ${q.where} FOR UPDATE`, q.values);
      await unlinkPlaces(db, rows.map(r => r.id), req.user.id);
    }
    const [result] = await db.execute(`DELETE FROM ${entityTable(req.params.entity)} WHERE ${q.where}`, q.values);
    return { deleted: result.affectedRows, files };
  });
  await cleanupAfterRemoval(result.files);
  res.json({ deleted: result.deleted });
});
