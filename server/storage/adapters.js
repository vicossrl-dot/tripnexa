import path from 'node:path';
import { mkdir, writeFile, readFile, unlink, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assert } from '../errors.js';

export const regions = { DE:'storage.bunnycdn.com', NY:'ny.storage.bunnycdn.com', LA:'la.storage.bunnycdn.com', SG:'sg.storage.bunnycdn.com', SYD:'syd.storage.bunnycdn.com', UK:'uk.storage.bunnycdn.com', SE:'se.storage.bunnycdn.com', BR:'br.storage.bunnycdn.com', JH:'jh.storage.bunnycdn.com' };
export const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
export function safeKey(key) {
  assert(typeof key==='string' && key.length<700 && key.split('/').every(part=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(part)&&part!=='.'&&part!=='..'),400,'Invalid storage reference.');
  return key;
}
export function localAdapter(root) {
  const location=key=>path.join(root,safeKey(key));
  return {
    async put(key,bytes){const target=location(key);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,bytes,{flag:'wx'});},
    async get(key){try{return await readFile(location(key));}catch(error){if(error.code==='ENOENT')assert(false,404,'File unavailable.');throw error;}},
    async stat(key){try{const info=await lstat(location(key));assert(info.isFile()&&!info.isSymbolicLink(),404,'File unavailable.');return {size:info.size};}catch(error){if(error.code==='ENOENT')return null;throw error;}},
    async exists(key){return !!await this.stat(key);},
    async remove(key){try{await unlink(location(key));}catch(error){if(error.code!=='ENOENT')throw error;}},
  };
}
export function bunnyAdapter({zone,password,region='DE'},fetchImpl=fetch) {
  assert(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,99}$/.test(zone||'')&&regions[region]&&password,503,'Bunny storage is not configured.');
  const call=async(key,method,bytes)=>{
    try {
      return await fetchImpl(`https://${regions[region]}/${zone}/${safeKey(key)}`,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{AccessKey:password,...(bytes?{'Content-Type':'application/octet-stream',Checksum:checksum(bytes).toUpperCase()}: {})},...(bytes?{body:bytes}:{})});
    } catch { assert(false,502,'Private storage is temporarily unavailable. Please retry.'); }
  };
  const valid=response=>assert(response.ok,502,'Private storage request failed. Please retry.');
  return {
    async put(key,bytes){valid(await call(key,'PUT',bytes));},
    async get(key){const response=await call(key,'GET');assert(response.status!==404,404,'File unavailable.');valid(response);const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;assert(size<=10*1024*1024,502,'Stored file exceeds the supported size.');chunks.push(chunk);}return Buffer.concat(chunks);},
    async stat(key){const response=await call(key,'HEAD');if(response.status===404)return null;valid(response);const length=response.headers.get('content-length'),size=Number(length);assert(length!==null&&Number.isFinite(size)&&size>=0,502,'Storage metadata unavailable.');return {size};},
    async exists(key){return !!await this.stat(key);},
    async remove(key){const response=await call(key,'DELETE');if(response.status!==404)valid(response);},
  };
}
