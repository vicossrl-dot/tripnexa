import path from 'node:path';
import {lstat,readdir} from 'node:fs/promises';
import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {config} from '../config.js';
import {assert} from '../errors.js';
import {paging,searchTerm} from './query.js';
import {auditRequest,actionReason} from './audit.js';
import {requireRecentAuth,requireSuperAdmin} from './permissions.js';

export const safeUploadName=/^[a-f0-9-]{36}\.(pdf|png|jpg|gif|webp)$/;
export function uploadPath(filename){assert(safeUploadName.test(filename),409,'Invalid stored file reference.');return path.join(config.uploads,filename);}
export async function fileStat(filename){try{const stat=await lstat(uploadPath(filename));return stat.isFile()&&!stat.isSymbolicLink()?stat:null;}catch(error){if(error.code==='ENOENT')return null;throw error;}}
// Also used lazily during upload for legacy rows. No content is read and no file is changed.
export async function measureFiles(db,ownerId=null){
 const [rows]=await db.execute('SELECT id,filename FROM uploads WHERE size_bytes IS NULL'+(ownerId?' AND owner_id=?':''),ownerId?[ownerId]:[]);
 let measured=0,missing=0;for(const row of rows){const stat=await fileStat(row.filename);if(stat){await db.execute('UPDATE uploads SET size_bytes=? WHERE id=? AND size_bytes IS NULL',[stat.size,row.id]);measured++;}else missing++;}return{measured,missing};
}
export async function scanStorage(){
 const measured=await measureFiles(pool),[rows]=await pool.query('SELECT id,filename FROM uploads');const known=new Set(rows.map(row=>row.filename));
 let missing=0;for(const row of rows)if(!await fileStat(row.filename))missing++;
 const entries=await readdir(config.uploads,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return[];throw error;});
 const orphans=[];for(const entry of entries){if(entry.isFile()&&safeUploadName.test(entry.name)&&!known.has(entry.name)){const stat=await fileStat(entry.name);if(stat&&Date.now()-stat.mtimeMs>86400000)orphans.push(entry.name);}}
 return{summary:{files:rows.length,missing,measured:measured.measured,untrackedOlderThan24h:orphans.length},orphans};
}
export const filesRouter=Router();
filesRouter.get('/files',async(req,res)=>{
 const p=paging(req.query,{created:'f.created_date',size:'f.size_bytes',mime:'f.mime'},'created'),where=['1=1'],args=[];
 if(req.query.q){where.push('(f.id=? OR f.owner_id=? OR u.email LIKE ?)');const q=searchTerm(req.query.q);args.push(q,q,'%'+q+'%');}
 if(req.query.mime){where.push('f.mime=?');args.push(searchTerm(req.query.mime));}
 if(['true','false'].includes(req.query.wallet)){where.push('f.wallet_managed=?');args.push(req.query.wallet==='true');}
 const from=' FROM uploads f JOIN users u ON u.id=f.owner_id WHERE '+where.join(' AND '),[[count]]=await pool.execute('SELECT COUNT(*) AS total'+from,args);
 const [rows]=await pool.execute(`SELECT f.id,f.owner_id,u.email AS owner,f.mime,f.size_bytes,f.wallet_managed,f.created_date,f.filename,(SELECT COUNT(*) FROM item_attachments a WHERE a.upload_id=f.id) AS attachment_count,(SELECT MIN(i.trip_id) FROM item_attachments a JOIN trip_items i ON i.id=a.item_id WHERE a.upload_id=f.id) AS trip_id${from}${p.order}${p.limit}`,args);
 const items=await Promise.all(rows.map(async({filename,...row})=>({...row,physical_status:await fileStat(filename)?'present':'missing',content_access:'denied by default'})));
 res.json({items,total:count.total,page:p.page,pageSize:p.size});
});
filesRouter.get('/storage',async(req,res)=>{const [[total]]=await pool.query('SELECT COUNT(*) AS files,COALESCE(SUM(size_bytes),0) AS bytes,SUM(size_bytes IS NULL) AS unmeasured FROM uploads');const [byMime]=await pool.query('SELECT mime,COUNT(*) AS files,SUM(size_bytes) AS bytes FROM uploads GROUP BY mime');const [largestUsers]=await pool.query('SELECT owner_id,COUNT(*) AS files,SUM(size_bytes) AS bytes FROM uploads GROUP BY owner_id ORDER BY bytes DESC LIMIT 20');res.json({total,byMime,largestUsers});});
filesRouter.get('/file-grants',async(req,res)=>{const [items]=await pool.execute(`SELECT id,file_id,requested_by,approved_by,reason,IF(status='APPROVED' AND expires_at<=UTC_TIMESTAMP(),'EXPIRED',status) AS status,expires_at,created_at FROM file_access_grants ${req.user.role==='SUPER_ADMIN'?'':'WHERE requested_by=?'} ORDER BY created_at DESC LIMIT 100`,req.user.role==='SUPER_ADMIN'?[]:[req.user.id]);res.json({items});});
filesRouter.post('/file-grants',requireRecentAuth,async(req,res)=>{
 const reason=actionReason(req.body,'REQUEST');const [[file]]=await pool.execute('SELECT id FROM uploads WHERE id=?',[String(req.body.file_id||'')]);assert(file,404,'File not found.');const id=randomUUID();await transaction(async db=>{await db.execute('INSERT INTO file_access_grants(id,file_id,requested_by,reason)VALUES(?,?,?,?)',[id,file.id,req.user.id,reason]);await auditRequest(req,{action:'file.access_requested',targetType:'file',targetId:file.id,reason},db);});res.json({id});
});
filesRouter.post('/file-grants/:id/approve',requireSuperAdmin,requireRecentAuth,async(req,res)=>{
 const reason=actionReason(req.body,'APPROVE'),minutes=Number(req.body.minutes||15);assert(Number.isInteger(minutes)&&minutes>=1&&minutes<=30,400,'Access can last 1–30 minutes.');
 await transaction(async db=>{const [[grant]]=await db.execute('SELECT * FROM file_access_grants WHERE id=? FOR UPDATE',[req.params.id]);assert(grant?.status==='PENDING',409,'Request is not pending.');assert(grant.requested_by!==req.user.id,403,'A different super administrator must approve this request.');await db.execute("UPDATE file_access_grants SET status='APPROVED',approved_by=?,expires_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE) WHERE id=?",[req.user.id,minutes,grant.id]);await auditRequest(req,{action:'file.access_approved',targetType:'file',targetId:grant.file_id,reason},db);});res.json({ok:true});
});
filesRouter.post('/file-grants/:id/revoke',requireSuperAdmin,requireRecentAuth,async(req,res)=>{const reason=actionReason(req.body,'REVOKE');await transaction(async db=>{const [result]=await db.execute("UPDATE file_access_grants SET status='REVOKED' WHERE id=?",[req.params.id]);assert(result.affectedRows,404,'Grant not found.');await auditRequest(req,{action:'file.access_revoked',targetType:'grant',targetId:req.params.id,reason},db);});res.json({ok:true});});
filesRouter.get('/file-grants/:id/content',requireRecentAuth,async(req,res)=>{
 const [[file]]=await pool.execute("SELECT f.id,f.filename,f.mime FROM file_access_grants g JOIN uploads f ON f.id=g.file_id WHERE g.id=? AND g.requested_by=? AND g.status='APPROVED' AND g.approved_by<>g.requested_by AND g.expires_at>UTC_TIMESTAMP()",[req.params.id,req.user.id]);assert(file,403,'No active grant for this file.');assert(await fileStat(file.filename),404,'Physical file is missing.');await auditRequest(req,{action:'file.content_download',targetType:'file',targetId:file.id});res.set({'Cache-Control':'private, no-store','Content-Type':file.mime,'Content-Security-Policy':"sandbox; default-src 'none'",'Content-Disposition':'attachment; filename="support-file.'+file.filename.split('.').at(-1)+'"'}).sendFile(uploadPath(file.filename));
});
