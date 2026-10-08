import {createHash,randomUUID} from 'node:crypto';
import {mkdir,open,readFile,rename,stat,unlink,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const MAX_RECORD_BYTES=7*1024*1024,FAILURE_COOLDOWN_MS=5*60*1000,LOCK_STALE_MS=60000;
const pending=new Map();
export const mapCacheHash=value=>createHash('sha256').update(Buffer.isBuffer(value)||typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const unavailable=()=>new Error('Static map temporarily unavailable.');

async function readRecord(filename,key,validate){
 try{
  const info=await stat(filename);if(info.size>MAX_RECORD_BYTES)return null;
  const record=JSON.parse(await readFile(filename,'utf8'));
  if(record.key!==key)return null;
  if(Number.isFinite(record.retryAfter)&&record.retryAfter>Date.now())throw unavailable();
  if(typeof record.png!=='string'||!/^([A-Za-z0-9+/]+={0,2})$/.test(record.png))return null;
  const bytes=Buffer.from(record.png,'base64');
  return record.sha256===mapCacheHash(bytes)&&validate(bytes)?bytes:null;
 }catch(error){if(error.message==='Static map temporarily unavailable.')throw error;return null;}
}
async function writeRecord(filename,record){
 const temporary=filename+'.'+randomUUID()+'.tmp';
 try{await writeFile(temporary,JSON.stringify(record),{mode:0o600,flag:'wx'});await rename(temporary,filename);}
 finally{await unlink(temporary).catch(()=>{});}
}

// Private content-addressed records have no success TTL. Hash changes select a
// different record; old versions are reusable if the traveler restores a day.
export async function cachedPdfMap({directory,scope,key,validate,generate,signal}){
 const folder=path.join(path.resolve(directory),scope),filename=path.join(folder,key+'.json'),lock=filename+'.lock';
 const cached=await readRecord(filename,key,validate);if(cached)return cached;
 if(pending.has(filename))return pending.get(filename);
 const work=(async()=>{
  await mkdir(folder,{recursive:true,mode:0o700});let handle;
  // The exclusive lock also coordinates backend processes sharing this volume.
  while(!handle){
   signal?.throwIfAborted();
   try{handle=await open(lock,'wx',0o600);}
   catch(error){
    if(error.code!=='EEXIST')throw error;
    const image=await readRecord(filename,key,validate);if(image)return image;
    try{if(Date.now()-(await stat(lock)).mtimeMs>LOCK_STALE_MS)await unlink(lock);}catch{/* Another worker released the lock. */}
    await delay(50,undefined,{signal});
   }
  }
  try{
   const image=await readRecord(filename,key,validate);if(image)return image;
   try{
    const bytes=await generate();if(!validate(bytes))throw unavailable();
    await writeRecord(filename,{key,sha256:mapCacheHash(bytes),png:bytes.toString('base64')});return bytes;
   }catch(error){
    // Failures are not successful images; short cooldown then a future export
    // may retry. Never retry immediately in the same PDF generation.
    if(error.code!=='MAP_KEY_NOT_CONFIGURED')await writeRecord(filename,{key,retryAfter:Date.now()+FAILURE_COOLDOWN_MS}).catch(()=>{});throw error;
   }
  }finally{await handle.close();await unlink(lock).catch(()=>{});}
 })();pending.set(filename,work);
 try{return await work;}finally{if(pending.get(filename)===work)pending.delete(filename);}
}
