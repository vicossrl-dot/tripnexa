import {createHash,randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {config} from '../config.js';
import {assert,HttpError} from '../errors.js';
export const ESSENTIALS_WINDOW_MS=86400000;
const prefix='essentials-update:',lockOperation='essentials-update-lock';
const operationFor=tripId=>prefix+createHash('sha256').update(tripId).digest('hex').slice(0,40);
const stamp=value=>String(value).padStart(13,'0');
// Reuse existing quota storage, with an exact timestamp bucket per started attempt.
// The separate zero-count row serializes both trip and account checks across workers.
export function createEssentialsAccounting({query=pool,transact=transaction,tripLimit=config.essentialsMaxUpdatesPerTrip24h,userLimit=config.essentialsMaxUpdatesPerUser24h}={}){
 async function read(ownerId,tripId,db=query,{locking=false}={}){
  const [[clock]]=await db.execute('SELECT CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED) AS nowMs');
  const now=Number(clock?.nowMs);assert(Number.isSafeInteger(now)&&now>0,503,'Travel brief update protection is temporarily unavailable.');
  // A current read is essential after waiting for the account lock under REPEATABLE READ.
  const [rows]=await db.execute("SELECT operation,bucket,count FROM usage_counters WHERE scope=? AND operation LIKE 'essentials-update:%' AND bucket>? AND bucket<=? ORDER BY bucket"+(locking?' FOR UPDATE':''),[ownerId,stamp(now-ESSENTIALS_WINDOW_MS)+'/',stamp(now)+'/']);
  const trip=rows.filter(row=>row.operation===operationFor(tripId)),count=list=>list.reduce((sum,row)=>sum+Number(row.count),0);
  const tripRemaining=Math.max(0,tripLimit-count(trip)),userRemaining=Math.max(0,userLimit-count(rows)),blocked=!tripRemaining||!userRemaining;
  const allowedAt=(list,limit)=>{let total=count(list);for(const row of list){total-=Number(row.count);if(total<limit)return Number(row.bucket.slice(0,13))+ESSENTIALS_WINDOW_MS;}return now;};
  const nextAllowedAt=blocked?new Date(Math.max(!tripRemaining?allowedAt(trip,tripLimit):now,!userRemaining?allowedAt(rows,userLimit):now)).toISOString():null;
  return {tripLimit,userLimit,tripRemaining,userRemaining,remaining:Math.min(tripRemaining,userRemaining),blocked,nextAllowedAt,serverTime:new Date(now).toISOString()};
 }
 async function lock(db,ownerId){
  await db.execute('INSERT INTO usage_counters(scope,operation,bucket,count) VALUES(?,?,?,0) ON DUPLICATE KEY UPDATE count=count',[ownerId,lockOperation,'lock']);
  await db.execute('SELECT count FROM usage_counters WHERE scope=? AND operation=? AND bucket=? FOR UPDATE',[ownerId,lockOperation,'lock']);
 }
 async function reserve(ownerId,tripId,signal){
  const operation=operationFor(tripId);
  const bucket=await transact(async db=>{
   signal?.throwIfAborted();
   const [[trip]]=await db.execute('SELECT id FROM trips WHERE id=? AND owner_id=?',[tripId,ownerId]);assert(trip,404,'Trip not found.');
   await lock(db,ownerId);signal?.throwIfAborted();
   const updates=await read(ownerId,tripId,db,{locking:true});
   if(updates.blocked){const error=new HttpError(429,'Daily update limit reached.');error.code='ESSENTIALS_DAILY_LIMIT';error.essentialsLimit=updates;throw error;}
   const now=Date.parse(updates.serverTime),value=stamp(now)+'.'+randomUUID().replaceAll('-','').slice(0,16);
   // Prune only expired quota records, never saved guides. All workers share this lock.
   await db.execute("DELETE FROM usage_counters WHERE scope=? AND operation LIKE 'essentials-update:%' AND bucket<=?",[ownerId,stamp(now-ESSENTIALS_WINDOW_MS)+'/']);
   signal?.throwIfAborted();
   await db.execute('INSERT INTO usage_counters(scope,operation,bucket,count) VALUES(?,?,?,1)',[ownerId,operation,value]);
   signal?.throwIfAborted();return value;
  });
  return {cancel:()=>transact(async db=>{await lock(db,ownerId);await db.execute('DELETE FROM usage_counters WHERE scope=? AND operation=? AND bucket=?',[ownerId,operation,bucket]);})};
 }
 return {read,reserve};
}
export const essentialsAccounting=createEssentialsAccounting();
