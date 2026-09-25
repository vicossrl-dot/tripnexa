import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool,transaction } from './db.js';
import { assert } from './errors.js';
import {runtimeSettings} from './admin/runtime.js';
import {measureFiles} from './admin/storage.js';

export function imageType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['png', 'image/png'];
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return ['jpg', 'image/jpeg'];
  if (/^GIF8[79]a$/.test(buffer.subarray(0,6).toString())) return ['gif', 'image/gif'];
  if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') return ['webp', 'image/webp'];
  return null;
}
export async function saveImage(buffer, ownerId) {
  return saveFile(buffer, ownerId, false);
}
export function documentType(buffer) {
  return buffer.subarray(0,5).toString() === '%PDF-' && buffer.subarray(-1024).includes(Buffer.from('%%EOF')) ? ['pdf', 'application/pdf'] : imageType(buffer);
}
export async function saveFile(buffer, ownerId, allowPdf = true, walletManaged = false) {
  const limits=runtimeSettings()?.quotas;
  if(limits)await measureFiles(pool,ownerId);
  if(limits)assert(buffer.length<=limits.max_upload_mb*1024*1024,413,'The configured upload size limit was exceeded.');
  const type = allowPdf ? documentType(buffer) : imageType(buffer);
  assert(type && buffer.length <= 10 * 1024 * 1024, 400, allowPdf ? 'Choose a PDF, PNG, JPEG, GIF or WebP file up to 10 MB.' : 'Choose a PNG, JPEG, GIF or WebP image up to 10 MB.');
  const id = randomUUID();
  const filename = `${id}.${type[0]}`;
  await mkdir(config.uploads, { recursive: true });
  const target = path.join(config.uploads, filename);
  await writeFile(target, buffer, { flag: 'wx' });
  try { await transaction(async db=>{await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[ownerId]);if(limits){const [[total]]=await db.execute('SELECT COALESCE(SUM(size_bytes),0) AS bytes,SUM(size_bytes IS NULL) AS unknown FROM uploads WHERE owner_id=?',[ownerId]);assert(!total.unknown,409,'Storage accounting is being prepared. Ask support to scan existing files before another upload.');assert(Number(total.bytes)+buffer.length<=limits.storage_mb_per_user*1024*1024,429,'Your storage quota has been reached.');}await db.execute('INSERT INTO uploads (id,owner_id,filename,mime,wallet_managed,size_bytes) VALUES (?,?,?,?,?,?)', [id, ownerId, filename, type[1], walletManaged,buffer.length]);}); }
  catch (error) { await unlink(target); throw error; }
  return { file_url: `/api/uploads/${id}` };
}
export async function ownedFile(fileUrl, ownerId, db = pool) {
  const id = /^\/api\/uploads\/([a-f0-9-]{36})$/.exec(fileUrl || '')?.[1];
  assert(id, 400, 'Choose a private uploaded file.');
  const [rows] = await db.execute('SELECT * FROM uploads WHERE id=? AND owner_id=? FOR UPDATE', [id, ownerId]);
  assert(rows[0], 404, 'File not found.');
  return rows[0];
}
export async function readOwnedFile(fileUrl, ownerId) {
  const file = await ownedFile(fileUrl, ownerId);
  assert(path.basename(file.filename) === file.filename, 400, 'Invalid file.');
  const buffer = await readFile(path.join(config.uploads, file.filename));
  assert(documentType(buffer) && buffer.length <= 10 * 1024 * 1024, 400, 'Unsupported document.');
  return { ...file, buffer };
}
export async function checkPrivateFiles(db, data, ownerId) {
  for (const key of ['arrival_ticket_url', 'departure_ticket_url', 'reservation_file_url']) {
    if (data[key]) await ownedFile(data[key], ownerId, db);
  }
}
export const uploadRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
uploadRouter.post('/', upload.single('file'), async (req, res) => {
  assert(req.file, 400, 'Choose an image.');
  res.status(201).json(await saveImage(req.file.buffer, req.user.id));
});
uploadRouter.post('/document', upload.single('file'), async (req, res) => {
  assert(req.file, 400, 'Choose a PDF or reservation image.');
  res.status(201).json(await saveFile(req.file.buffer, req.user.id));
});
uploadRouter.post('/wallet', upload.single('file'), async (req, res) => {
  assert(req.file, 400, 'Choose a PDF or image.');
  const saved = await saveFile(req.file.buffer, req.user.id, true, true);
  res.status(201).json({ ...saved, mime: documentType(req.file.buffer)[1], original_name: req.file.originalname.replace(/[\x00-\x1f\\/]/g, '_').slice(0,255) || 'Travel file' });
});
uploadRouter.get('/:id', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM uploads WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
  assert(rows[0], 404, 'Image not found.');
  res.set({ 'Content-Type': rows[0].mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  if (rows[0].mime === 'application/pdf') {
    res.set('Content-Disposition', `${req.query.view === '1' ? 'inline' : 'attachment'}; filename="document.pdf"`);
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Content-Security-Policy', "sandbox; default-src 'none'; frame-ancestors 'self'");
  }
  res.sendFile(rows[0].filename, { root: config.uploads, dotfiles: 'deny' });
});
