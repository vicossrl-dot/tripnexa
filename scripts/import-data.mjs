import { readFile, stat, mkdir, copyFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from '../server/db.js';
import { config } from '../server/config.js';
import { schemas, tables, validateData } from '../server/schema.js';
import { insertRecord } from '../server/entities.js';
import { normalizeEmail } from '../server/security.js';
import { imageType } from '../server/uploads.js';
import { assert } from '../server/errors.js';

// Offline JSON import. Defaults to validation only; existing rows are never overwritten.
const args = process.argv.slice(2);
const source = args.find(arg => !arg.startsWith('--'));
const option = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const apply = args.includes('--apply');
const writtenFiles = [];
try {
  assert(source, 400, 'Usage: npm run data:import -- export.json [--owner=email] [--media-map=files.json] [--apply]');
  const input = JSON.parse(await readFile(source, 'utf8'));
  const mediaMapPath = option('media-map');
  const mediaMap = mediaMapPath ? JSON.parse(await readFile(mediaMapPath, 'utf8')) : {};
  const mediaRoot = mediaMapPath ? path.dirname(path.resolve(mediaMapPath)) : process.cwd();
  async function prepareMedia(data) {
    const files = [];
    for (const [field, value] of Object.entries(data)) {
      if (typeof value !== 'string') continue;
      if (Object.hasOwn(mediaMap, value)) {
        const sourcePath = path.resolve(mediaRoot, mediaMap[value]);
        const info = await stat(sourcePath);
        assert(info.isFile() && info.size <= 20 * 1024 * 1024, 400, 'Imported files must be at most 20 MB.');
        const buffer = await readFile(sourcePath);
        const type = imageType(buffer) || (buffer.subarray(0,5).toString() === '%PDF-' ? ['pdf','application/pdf'] : null);
        assert(type, 400, 'Imported files must be PNG, JPEG, GIF, WebP or PDF.');
        const id = randomUUID();
        files.push({ sourcePath, id, filename: `${id}.${type[0]}`, mime: type[1] });
        data[field] = `/api/uploads/${id}`;
      }
      assert(!/https?:\/\/([^/]*\.)?base44\.(com|app)([/:]|$)/i.test(data[field]), 400, `Unmigrated hosted URL in ${field}. Supply --media-map with a downloaded local file.`);
    }
    return files;
  }
  const users = new Map();
  const emails = new Map();
  const addUser = async raw => {
    const email = normalizeEmail(raw.email);
    const id = raw.id || randomUUID();
    assert(/^[a-zA-Z0-9_-]{1,64}$/.test(id), 400, 'Invalid exported user ID.');
    assert(!users.has(id) && !emails.has(email), 400, 'Duplicate user ID or email in export.');
    const profile = Object.fromEntries(Object.entries(raw).filter(([key]) => Object.hasOwn(schemas.User.properties, key)));
    const files = await prepareMedia(profile);
    const user = { id, email, ...validateData('User', profile), files };
    users.set(id, user); emails.set(email, id);
    return id;
  };
  for (const raw of input.User || []) await addUser(raw);
  const fallbackEmail = option('owner') ? normalizeEmail(option('owner')) : null;
  let fallbackId = fallbackEmail && emails.get(fallbackEmail);
  if (fallbackEmail && !fallbackId) fallbackId = await addUser({ email: fallbackEmail });
  const records = [];
  const parents = new Map();
  for (const name of Object.keys(tables)) {
    assert(!input[name] || Array.isArray(input[name]), 400, `${name} must be an array.`);
    for (const raw of input[name] || []) {
      assert(typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(raw.id), 400, `${name} record needs its original ID.`);
      assert(!parents.has(`${name}:${raw.id}`), 400, `Duplicate ${name} ID.`);
      const parentKey = name === 'TodoItem' ? `TodoBoard:${raw.board_id}` : raw.trip_id ? `Trip:${raw.trip_id}` : null;
      const parent = parentKey ? parents.get(parentKey) : null;
      if (parentKey) assert(parent, 400, `Missing parent for ${name} ${raw.id}.`);
      const explicitOwner = raw.created_by_id || raw.owner_id || raw.created_by;
      let ownerId = explicitOwner && (users.has(explicitOwner) ? explicitOwner : emails.get(String(explicitOwner).toLowerCase()));
      if (explicitOwner) assert(ownerId, 400, `Unknown owner for ${name} ${raw.id}. Include that user in the export.`);
      ownerId ||= parent?.ownerId || fallbackId;
      assert(ownerId, 400, `Owner is missing for ${name} ${raw.id}. Supply --owner=email only if those records belong to that account.`);
      if (parent) assert(parent.ownerId === ownerId, 400, 'Parent and child have different owners.');
      const data = Object.fromEntries(Object.entries(raw).filter(([key]) => Object.hasOwn(schemas[name].properties, key)));
      // Imported trips start private. Owners can create fresh share links after reviewing them.
      if (name === 'Trip') { data.share_enabled = false; data.share_token = null; }
      const files = [];
      for (const [field, value] of Object.entries(data)) {
        if (typeof value !== 'string') continue;
        if (Object.hasOwn(mediaMap, value)) {
          const sourcePath = path.resolve(mediaRoot, mediaMap[value]);
          const info = await stat(sourcePath);
          assert(info.isFile() && info.size <= 20 * 1024 * 1024, 400, 'Imported files must be at most 20 MB.');
          const buffer = await readFile(sourcePath);
          const type = imageType(buffer) || (buffer.subarray(0,5).toString() === '%PDF-' ? ['pdf','application/pdf'] : null);
          assert(type, 400, 'Imported files must be PNG, JPEG, GIF, WebP or PDF.');
          const id = randomUUID();
          files.push({ sourcePath, id, filename: `${id}.${type[0]}`, mime: type[1] });
          data[field] = `/api/uploads/${id}`;
        }
        assert(!/https?:\/\/([^/]*\.)?base44\.(com|app)([/:]|$)/i.test(data[field]), 400, `Unmigrated hosted URL in ${name}.${field}. Supply --media-map with a downloaded local file.`);
      }
      const record = { name, id: raw.id, ownerId, data: validateData(name, data, false, true), files, created_date: raw.created_date, updated_date: raw.updated_date };
      for (const field of ['created_date', 'updated_date']) if (record[field]) assert(!Number.isNaN(+new Date(record[field])), 400, `Invalid ${field}.`);
      if (name === 'PlaceSelection' && data.trip_item_id) {
        const linked = parents.get(`TripItem:${data.trip_item_id}`);
        assert(linked && linked.ownerId === ownerId && linked.data.trip_id === data.trip_id, 400, 'Invalid linked trip item.');
      }
      parents.set(`${name}:${raw.id}`, record); records.push(record);
    }
  }
  console.log(`Validated ${users.size} users, ${records.length} records and ${records.reduce((n,r) => n + r.files.length, 0) + [...users.values()].reduce((n,u) => n + u.files.length, 0)} files.`);
  if (!apply) console.log('Dry run only. Add --apply to import into the configured database.');
  else {
    await mkdir(config.uploads, { recursive: true });
    await transaction(async db => {
      for (const user of users.values()) {
        const { files, ...profile } = user;
        const fields = Object.keys(profile);
        await db.execute(`INSERT INTO users (${fields.map(k => `\`${k}\``).join(',')}) VALUES (${fields.map(() => '?').join(',')})`, Object.values(profile));
        for (const file of files) {
          const target = path.join(config.uploads, file.filename);
          await copyFile(file.sourcePath, target); writtenFiles.push(target);
          await db.execute('INSERT INTO uploads (id,owner_id,filename,mime) VALUES (?,?,?,?)', [file.id, user.id, file.filename, file.mime]);
        }
      }
      for (const row of records) {
        for (const file of row.files) {
          const target = path.join(config.uploads, file.filename);
          await copyFile(file.sourcePath, target);
          writtenFiles.push(target);
          await db.execute('INSERT INTO uploads (id,owner_id,filename,mime) VALUES (?,?,?,?)', [file.id, row.ownerId, file.filename, file.mime]);
        }
        await insertRecord(db, row.name, row.data, row.ownerId, { id: row.id, internal: true });
        for (const field of ['created_date','updated_date']) if (row[field]) {
          const date = new Date(row[field]);
          assert(!Number.isNaN(+date), 400, `Invalid ${field}.`);
          await db.execute(`UPDATE ${tables[row.name]} SET ${field}=? WHERE id=?`, [date, row.id]);
        }
      }
    });
    console.log('Import committed. Imported users must use Forgot password to activate local credentials.');
  }
} catch (error) {
  for (const filename of writtenFiles) await unlink(filename).catch(() => {});
  console.error('Import stopped; database changes rolled back:', error.code || error.message);
  process.exitCode = 1;
} finally { await pool.end(); }
