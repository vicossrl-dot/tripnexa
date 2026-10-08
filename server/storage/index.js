import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { readSettings, definitions, parseJson } from '../admin/settings.js';
import { decryptSecret } from '../admin/crypto.js';
import { runtimeSettings } from '../admin/runtime.js';
import { assert } from '../errors.js';
import { localAdapter, bunnyAdapter, checksum } from './adapters.js';

export async function storageConfiguration({credentials='active'}={}) {
  const all=runtimeSettings()||await readSettings(),settings=all.settings;
  const [[secret]]=await pool.execute("SELECT encrypted_value FROM managed_secrets WHERE secret_name='BUNNY_STORAGE_PASSWORD'");
  const needsPassword=credentials==='always'||credentials==='active'&&settings.storage_provider==='bunny';
  return {provider:settings.storage_provider,zone:settings.bunny_storage_zone,region:settings.bunny_storage_region,
    password:needsPassword?(secret?decryptSecret(secret.encrypted_value,'provider:BUNNY_STORAGE_PASSWORD'):process.env.BUNNY_STORAGE_PASSWORD||''):'',passwordConfigured:!!secret||!!process.env.BUNNY_STORAGE_PASSWORD,publicCdn:settings.bunny_public_cdn_base};
}
export async function uploadStorage(ownerId,tripId,filename,kind='wallet') {
  const settings=await storageConfiguration();
  assert(['local','bunny'].includes(settings.provider),503,'Choose a storage provider.');
  const key=settings.provider==='bunny'?(kind==='generated'?`users/${ownerId}/trips/${tripId||'account'}/generated/${filename}`:`users/${ownerId}/${kind}/${tripId||'account'}/${filename}`):filename;
  return {provider:settings.provider,key,zone:settings.provider==='bunny'?settings.zone:null,region:settings.provider==='bunny'?settings.region:null,
    adapter:settings.provider==='bunny'?bunnyAdapter(settings):localAdapter(config.uploads)};
}
export async function lockStorageZone(db,zone) {
  // Same lock/order as administrative setting writes: don't strand an in-flight upload.
  await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");
  const [[row]]=await db.query("SELECT CAST(value AS CHAR) AS value FROM app_settings WHERE setting_key='bunny_storage_zone'");
  assert((row?parseJson(row.value):definitions.settings.bunny_storage_zone.default)===zone,409,'Storage configuration changed during upload. Please retry.');
}
export async function storedAdapter(file) {
  if(!file.storage_provider||file.storage_provider==='local')return localAdapter(config.uploads);
  assert(file.storage_provider==='bunny',503,'Unsupported storage provider.');
  const settings=await storageConfiguration({credentials:'always'});
  // Never silently read an existing object from a newly configured zone.
  assert(file.storage_zone===settings.zone,503,'This file needs its original Bunny storage configuration.');
  return bunnyAdapter({...settings,zone:file.storage_zone,region:file.storage_region});
}
export async function readStoredFile(file) {const bytes=await (await storedAdapter(file)).get(file.storage_key||file.filename);if(file.checksum_sha256)assert(checksum(bytes)===file.checksum_sha256,502,'Stored file integrity check failed.');return bytes;}
export async function deleteStoredFile(file) {return (await storedAdapter(file)).remove(file.storage_key||file.filename);}
export async function statStoredFile(file) {return (await storedAdapter(file)).stat(file.storage_key||file.filename);}
export async function testBunnyConnection(settings,fetchImpl=fetch) {
  const adapter=bunnyAdapter(settings,fetchImpl),key=`connection-tests/${randomUUID()}.txt`,bytes=Buffer.from('TripNexa storage verification '+randomUUID());
  let ok=false,cleanup=false;
  try {await adapter.put(key,bytes);ok=checksum(await adapter.get(key))===checksum(bytes);}catch {ok=false;}
  finally {try{await adapter.remove(key);cleanup=!await adapter.exists(key);}catch{/* Report the exact test object for operator cleanup, never a credential. */}}
  return {ok:ok&&cleanup,cleanup,note:ok&&cleanup?'Upload, read integrity and deletion verified.':'Connection verification failed. Check configuration and connectivity.',...(!cleanup?{cleanupKey:key}:{})};
}
