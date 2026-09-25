import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { owned, insertRecord, updateRecord } from './entities.js';
import { ownedFile } from './uploads.js';
import { assert } from './errors.js';
import { serialize } from './schema.js';
import { cleanupAfterRemoval } from './file-lifecycle.js';
import {runtimeSettings} from './admin/runtime.js';

const uploadId = url => /^\/api\/uploads\/([a-f0-9-]{36})$/.exec(url || '')?.[1];
export function attachmentMetadata(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 400, 'Invalid attachment metadata.');
  const result = {};
  for (const [key, limit] of [['label',255],['traveler',200],['notes',4000],['document_type',60],['original_name',255]]) {
    assert(input[key] == null || typeof input[key] === 'string' && input[key].length <= limit && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input[key]), 400, `Invalid attachment ${key}.`);
    if (Object.hasOwn(input,key)) result[key] = input[key]?.trim() || null;
  }
  if (Object.hasOwn(input,'expiry_date')) {
    const date = input.expiry_date;
    assert(!date || typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0,10) === date, 400, 'Invalid expiry date.');
    result.expiry_date = date || null;
  }
  return result;
}
function publicAttachment(row) {
  return { id: row.id, label: row.label, traveler: row.traveler, notes: row.notes, document_type: row.document_type, expiry_date: row.expiry_date,
    original_name: row.original_name, mime: row.mime, file_url: `/api/uploads/${row.upload_id}` };
}
export async function itemAttachments(db, item, ownerId) {
  const [rows] = await db.execute('SELECT a.*,u.mime FROM item_attachments a JOIN uploads u ON u.id=a.upload_id AND u.owner_id=a.owner_id WHERE a.item_id=? AND a.owner_id=? ORDER BY a.created_date,a.id', [item.id,ownerId]);
  const attachments = rows.map(publicAttachment);
  // Old fields are projected on demand, so records written by older screens/imports stay visible.
  for (const field of ['reservation_file_url', ...(item.category === 'document' ? ['image_url'] : [])]) {
    const id = uploadId(item[field]);
    if (!id || attachments.some(file => file.file_url === item[field])) continue;
    const [files] = await db.execute('SELECT id,mime FROM uploads WHERE id=? AND owner_id=?', [id,ownerId]);
    if (files[0]) attachments.push({ id: `legacy:${field}`, file_url: item[field], mime: files[0].mime, original_name: field === 'image_url' ? 'Original document' : 'Reservation', label: '', traveler: '', notes: '', document_type: '', expiry_date: null });
  }
  return attachments;
}
export async function readWallet(tripId, ownerId) {
  const trip = await owned(pool,'Trip',tripId,ownerId);
  const [rows] = await pool.execute('SELECT * FROM trip_items WHERE trip_id=? AND owner_id=? ORDER BY COALESCE(date,LEFT(departure_datetime,10)),created_date,id', [tripId,ownerId]);
  const items = [];
  for (const row of rows) items.push({ ...serialize('TripItem',row), attachments: await itemAttachments(pool,row,ownerId) });
  for (const direction of ['arrival','departure']) {
    const id = uploadId(trip[`${direction}_ticket_url`]); if (!id) continue;
    const [files] = await pool.execute('SELECT mime FROM uploads WHERE id=? AND owner_id=?', [id,ownerId]);
    if (files[0]) items.push({ id:`legacy-${direction}`, category:'flight', title: `${direction === 'arrival' ? 'Arrival' : 'Departure'} · ${trip[`${direction}_location`] || 'Travel ticket'}`, date:trip[`${direction}_datetime`]?.slice(0,10), time:trip[`${direction}_datetime`]?.slice(11,16), legacy:true,
      attachments:[{id:`legacy-${direction}`,file_url:trip[`${direction}_ticket_url`],mime:files[0].mime,original_name:`${direction} ticket`}] });
  }
  return { items };
}
export async function saveWalletItem(tripId, itemId, body, ownerId) {
  assert(body && body.item && typeof body.item === 'object' && !Array.isArray(body.item),400,'Choose an item.');
  const attachments = body.attachments || [], removals = body.remove_attachment_ids || [];
  assert(Array.isArray(attachments) && attachments.length <= 100 && Array.isArray(removals) && removals.length <= 100 && removals.every(id => typeof id === 'string'),400,'Use up to 100 attachments per save.');
  const result = await transaction(async db => {
    await owned(db,'Trip',tripId,ownerId,true);
    let item;
    if (itemId) {
      item = await owned(db,'TripItem',itemId,ownerId,true);
      assert(item.trip_id === tripId,404,'Item not found in this trip.');
      item = await updateRecord(db,'TripItem',itemId,{...body.item,trip_id:tripId},ownerId);
    } else item = await insertRecord(db,'TripItem',{...body.item,trip_id:tripId},ownerId);
    const filesToClean = [];
    const current = await itemAttachments(db,item,ownerId);
    for (const id of removals) {
      const file = current.find(file => file.id === id);assert(file,404,'Attachment not found.');
      filesToClean.push(uploadId(file.file_url));
      if (!id.startsWith('legacy:')) await db.execute('DELETE FROM item_attachments WHERE id=? AND item_id=? AND owner_id=?',[id,item.id,ownerId]);
      for (const field of ['reservation_file_url',...(item.category === 'document' ? ['image_url'] : [])]) if (item[field] === file.file_url) {
        await db.execute(`UPDATE trip_items SET ${field}=NULL WHERE id=? AND owner_id=?`,[item.id,ownerId]); item[field] = null;
      }
      await db.execute('UPDATE uploads SET wallet_managed=TRUE WHERE id=? AND owner_id=?',[uploadId(file.file_url),ownerId]);
    }
    for (const attachment of attachments) {
      assert(attachment && typeof attachment === 'object' && !Array.isArray(attachment) && (attachment.id == null || typeof attachment.id === 'string'),400,'Invalid attachment.');
      if (attachment.id && removals.includes(attachment.id)) continue;
      const data = attachmentMetadata(attachment);
      if (attachment.id && !attachment.id.startsWith('legacy:')) {
        assert(current.some(file => file.id === attachment.id),404,'Attachment not found.');
        const keys = Object.keys(data).filter(key => key !== 'original_name');
        if (keys.length) await db.execute(`UPDATE item_attachments SET ${keys.map(key => `\`${key}\`=?`).join(',')} WHERE id=? AND item_id=? AND owner_id=?`,[...keys.map(key => data[key]),attachment.id,item.id,ownerId]);
      } else {
        const legacy = attachment.id ? current.find(file => file.id === attachment.id) : null;
        if (attachment.id) assert(legacy,404,'Legacy attachment not found.');
        const file = await ownedFile(legacy?.file_url || attachment.file_url,ownerId,db);
        const [existing] = await db.execute('SELECT id FROM item_attachments WHERE item_id=? AND upload_id=?',[item.id,file.id]);
        if (existing.length) continue; // An upload retry must not duplicate an existing file.
        await db.execute('INSERT INTO item_attachments (id,owner_id,item_id,upload_id,original_name,label,traveler,notes,document_type,expiry_date) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [randomUUID(),ownerId,item.id,file.id,legacy?.original_name || data.original_name || 'Travel file',data.label || null,data.traveler || null,data.notes || null,data.document_type || null,data.expiry_date || null]);
        await db.execute('UPDATE uploads SET wallet_managed=TRUE WHERE id=? AND owner_id=?',[file.id,ownerId]);
      }
    }
    const [count] = await db.execute('SELECT COUNT(*) AS n FROM item_attachments WHERE item_id=?',[item.id]);assert(count[0].n <= 100,400,'Use up to 100 files in one booking.');
    const limits=runtimeSettings()?.quotas;if(limits){const [[total]]=await db.execute('SELECT COUNT(*) AS n FROM item_attachments a JOIN trip_items i ON i.id=a.item_id WHERE i.trip_id=?',[tripId]);assert(total.n<=limits.uploads_per_trip,429,'This trip has reached its attachment quota.');}
    return { item:serialize('TripItem',await owned(db,'TripItem',item.id,ownerId)), filesToClean };
  });
  await cleanupAfterRemoval(result.filesToClean);
  return { ...result.item, attachments:await itemAttachments(pool,result.item,ownerId) };
}
export const walletRouter = Router({mergeParams:true});
walletRouter.get('/',async(req,res)=>res.json(await readWallet(req.params.tripId,req.user.id)));
walletRouter.post('/items',async(req,res)=>res.status(201).json(await saveWalletItem(req.params.tripId,null,req.body,req.user.id)));
walletRouter.patch('/items/:itemId',async(req,res)=>res.json(await saveWalletItem(req.params.tripId,req.params.itemId,req.body,req.user.id)));
