import path from 'node:path';
import { unlink } from 'node:fs/promises';
import { pool, transaction } from './db.js';
import { config } from './config.js';

// Only wallet-managed files are eligible. Existing images/avatars are not swept.
export async function cleanupWalletFiles(ids = null) {
  let cursor = '';
  while (true) {
  const [candidates] = await pool.execute(`SELECT id FROM uploads WHERE wallet_managed=TRUE ${ids ? `AND id IN (${ids.map(() => '?').join(',') || 'NULL'})` : 'AND created_date < UTC_TIMESTAMP() - INTERVAL 24 HOUR'} AND id>? ORDER BY id LIMIT 500`, [...(ids || []),cursor]);
  for (const candidate of candidates) await transaction(async db => {
    const [rows] = await db.execute('SELECT * FROM uploads WHERE id=? AND wallet_managed=TRUE FOR UPDATE', [candidate.id]);
    const file = rows[0]; if (!file) return;
    const url = `/api/uploads/${file.id}`;
    const [references] = await db.execute(`SELECT
      (SELECT COUNT(*) FROM item_attachments WHERE upload_id=?) +
      (SELECT COUNT(*) FROM trips WHERE arrival_ticket_url=? OR departure_ticket_url=? OR cover_image_url=?) +
      (SELECT COUNT(*) FROM trip_items WHERE reservation_file_url=? OR image_url=? OR url=?) +
      (SELECT COUNT(*) FROM users WHERE avatar_url=?) +
      (SELECT COUNT(*) FROM place_selections WHERE source_url=?) +
      (SELECT COUNT(*) FROM itinerary_items WHERE source_url=?) AS total`, [file.id,url,url,url,url,url,url,url,url,url]);
    if (references[0].total) return;
    // A generated basename under the configured private storage root; never accept a user path.
    if (!/^[a-f0-9-]{36}\.(pdf|png|jpg|gif|webp)$/.test(file.filename)) throw new Error('Unsafe stored upload filename.');
    try { await unlink(path.join(config.uploads, file.filename)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await db.execute('DELETE FROM uploads WHERE id=?', [file.id]);
  });
  if (candidates.length < 500) break;
  cursor = candidates.at(-1).id;
  }
}
export async function walletFilesForRemoval(db, name, ids, ownerId) {
  if (!['Trip','TripItem'].includes(name) || !ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [files] = await db.execute(`SELECT DISTINCT a.upload_id FROM item_attachments a JOIN trip_items i ON i.id=a.item_id AND i.owner_id=a.owner_id WHERE a.owner_id=? AND i.${name === 'Trip' ? 'trip_id' : 'id'} IN (${placeholders})`, [ownerId,...ids]);
  // Legacy references are collected too, without altering unrelated uploads.
  const [items] = await db.execute(`SELECT image_url,reservation_file_url,category FROM trip_items WHERE owner_id=? AND ${name === 'Trip' ? 'trip_id' : 'id'} IN (${placeholders})`, [ownerId,...ids]);
  const urls = items.flatMap(item => [item.reservation_file_url, item.category === 'document' ? item.image_url : null]);
  if (name === 'Trip') {
    const [trips] = await db.execute(`SELECT arrival_ticket_url,departure_ticket_url FROM trips WHERE owner_id=? AND id IN (${placeholders})`, [ownerId,...ids]);
    urls.push(...trips.flatMap(trip => [trip.arrival_ticket_url,trip.departure_ticket_url]));
  }
  const result = [...new Set([...files.map(file => file.upload_id), ...urls.map(url => /^\/api\/uploads\/([a-f0-9-]{36})$/.exec(url || '')?.[1]).filter(Boolean)])];
  if (result.length) await db.execute(`UPDATE uploads SET wallet_managed=TRUE WHERE owner_id=? AND id IN (${result.map(() => '?').join(',')})`, [ownerId,...result]);
  return result;
}
export function cleanupAfterRemoval(ids) {
  return cleanupWalletFiles(ids).catch(error => console.error('Private file cleanup pending:', error.code || error.name));
}
