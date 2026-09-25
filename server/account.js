import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {rateLimit} from 'express-rate-limit';
import {pool,transaction} from './db.js';
import {verifyPassword,hashPassword} from './security.js';
import {serialize,tables} from './schema.js';
import {assert} from './errors.js';
export const accountRouter=Router();
accountRouter.use(rateLimit({windowMs:15*60000,limit:30,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false}));
async function confirm(db,req){
 const [[user]]=await db.execute('SELECT * FROM users WHERE id=? FOR UPDATE',[req.user.id]);
 assert(user?.status==='ACTIVE'&&await verifyPassword(req.body.password,user.password_hash),403,'Enter your current password to continue.');return user;
}
accountRouter.get('/sessions',async(req,res)=>{const [items]=await pool.execute('SELECT id,device_summary,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC',[req.user.id]);res.json({items:items.map(item=>({...item,current:item.id===req.session.id}))});});
accountRouter.post('/sessions/revoke',async(req,res)=>{
 await transaction(async db=>{await confirm(db,req);assert(req.body.confirmation==='REVOKE',400,'Confirm signing out your other devices.');await db.execute('DELETE FROM sessions WHERE user_id=? AND id<>?',[req.user.id,req.session.id]);});res.json({ok:true});
});
accountRouter.post('/password',async(req,res)=>{
 const hash=await hashPassword(req.body.newPassword);
 await transaction(async db=>{await confirm(db,req);await db.execute('UPDATE users SET password_hash=? WHERE id=?',[hash,req.user.id]);await db.execute('DELETE FROM sessions WHERE user_id=?',[req.user.id]);await db.execute('DELETE FROM auth_tokens WHERE user_id=?',[req.user.id]);});
 res.clearCookie('tripsync_session',{path:'/'}).json({ok:true,signInAgain:true});
});
accountRouter.get('/deletion',async(req,res)=>{const [rows]=await pool.execute("SELECT status,created_at FROM privacy_requests WHERE user_id=? AND type='DELETE' ORDER BY created_at DESC LIMIT 1",[req.user.id]);res.json({request:rows[0]||null});});
accountRouter.post('/deletion',async(req,res)=>{
 await transaction(async db=>{const user=await confirm(db,req);assert(user.role==='USER',409,'Ask another super administrator to remove your administrator role before requesting account deletion.');assert(req.body.confirmation==='DELETE MY ACCOUNT',400,'Type DELETE MY ACCOUNT to confirm.');const [pending]=await db.execute("SELECT id FROM privacy_requests WHERE user_id=? AND type='DELETE' AND status='PENDING'",[req.user.id]);if(!pending.length)await db.execute("INSERT INTO privacy_requests(id,user_id,type)VALUES(?,?,'DELETE')",[randomUUID(),req.user.id]);});res.json({ok:true,message:'Your deletion request is pending review. Your account and files remain available until it is processed. Contact support to cancel.'});
});
accountRouter.post('/export',async(req,res)=>{
 const data=await transaction(async db=>{
  const user=await confirm(db,req),result={exportedAt:new Date().toISOString(),profile:serialize('User',user),records:{},filesIncluded:false};
  for(const [entity,table]of Object.entries(tables)){const [rows]=await db.execute(`SELECT * FROM ${table} WHERE owner_id=? LIMIT 5001`,[user.id]);assert(rows.length<=5000,413,'Your account needs a larger export. Please contact support.');result.records[entity]=rows.map(row=>{const record=serialize(entity,row);delete record.share_token;return record;});}
  const [attachments]=await db.execute('SELECT item_id,original_name,label,traveler,notes,document_type,expiry_date FROM item_attachments WHERE owner_id=? LIMIT 5001',[user.id]);assert(attachments.length<=5000,413,'Your files need a larger export. Please contact support.');result.records.attachments=attachments;
  const [bookings]=await db.execute('SELECT trip_id,selection_id,item_id,declared_booked,provider FROM affiliate_wallet_links WHERE owner_id=? LIMIT 5001',[user.id]);assert(bookings.length<=5000,413,'Your bookings need a larger export. Please contact support.');result.records.ticketAssociations=bookings;return result;
 });res.set('Content-Disposition','attachment; filename="TripSync-my-data.json"').json(data);
});
