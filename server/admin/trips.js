import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {paging,searchTerm} from './query.js';
import {auditRequest,actionReason} from './audit.js';
import {requireRecentAuth,requireSuperAdmin} from './permissions.js';
import {snapshot,present,revision,persist} from '../itinerary-service.js';
import {scheduleItinerary} from '../itinerary-engine.js';
import {publicProjection} from '../trips.js';
import {walletFilesForRemoval,cleanupAfterRemoval} from '../file-lifecycle.js';
const fields='t.id,t.name,t.destination,t.owner_id,u.email AS owner_email,t.start_date,t.end_date,t.plan_status,t.plan_version,t.share_enabled,t.created_date,t.updated_date';
export const tripsAdminRouter=Router();
tripsAdminRouter.get('/',async(req,res)=>{
 const p=paging(req.query,{created:'t.created_date',updated:'t.updated_date',destination:'t.destination',name:'t.name'},'created'),where=['1=1'],args=[];
 if(req.query.q){where.push('(t.id=? OR t.name LIKE ? OR t.destination LIKE ? OR u.email LIKE ?)');const q=searchTerm(req.query.q);args.push(q,'%'+q+'%','%'+q+'%','%'+q+'%');}
 for(const key of ['owner_id','destination','plan_status'])if(req.query[key]){where.push(`t.${key}=?`);args.push(searchTerm(req.query[key]));}
 if(req.query.from){where.push('t.start_date>=?');args.push(String(req.query.from));}if(req.query.to){where.push('t.end_date<=?');args.push(String(req.query.to));}
 if(['true','false'].includes(req.query.shared)){where.push('t.share_enabled=?');args.push(req.query.shared==='true');}
 if(['true','false'].includes(req.query.itinerary)){where.push(`${req.query.itinerary==='false'?'NOT ':''}EXISTS(SELECT 1 FROM itinerary_items i WHERE i.trip_id=t.id)`);}
 if(req.query.review==='true')where.push("t.plan_status='needs_verification'");
 const clause=' FROM trips t JOIN users u ON u.id=t.owner_id WHERE '+where.join(' AND '),[[count]]=await pool.execute('SELECT COUNT(*) AS total'+clause,args);
 const [items]=await pool.execute(`SELECT ${fields},(SELECT COUNT(*) FROM itinerary_items i WHERE i.trip_id=t.id) AS itinerary_count${clause}${p.order}${p.limit}`,args);res.json({items,total:count.total,page:p.page,pageSize:p.size});
});
async function load(id){const [rows]=await pool.execute(`SELECT ${fields},t.adults,t.children_ages,t.travel_type FROM trips t JOIN users u ON u.id=t.owner_id WHERE t.id=?`,[id]);assert(rows[0],404,'Trip not found.');return rows[0];}
async function diagnostics(id){
 const trip=await load(id),state=await transaction(db=>snapshot(db,id,trip.owner_id)),plan=await present(state);
 const [[wallet]]=await pool.execute('SELECT COUNT(*) AS total FROM item_attachments a JOIN trip_items i ON i.id=a.item_id WHERE i.trip_id=?',[id]);
 let children=[];try{children=JSON.parse(trip.children_ages||'[]');}catch{}delete trip.children_ages;
 return{trip:{...trip,children_count:Array.isArray(children)?children.length:0},diagnostics:{missing_location:state.places.filter(p=>!p.address||p.lat==null||p.lng==null).length,unresolved_places:state.places.filter(p=>p.status==='ambiguous'||p.status==='unresolved').length,conflicts:plan.conflicts.map(c=>({code:c.code||'scheduling',date:c.date||null})),requiresRegeneration:plan.requiresRegeneration,stale:plan.stale,generation:plan.generation},counts:{trip_items:state.tripItems.length,places:state.places.length,optional_unscheduled:plan.unscheduledOptional.length,itinerary_items:state.items.length,wallet_files:wallet.total}};
}
tripsAdminRouter.get('/:id',async(req,res)=>res.json(await diagnostics(req.params.id)));
tripsAdminRouter.get('/:id/diagnostics',async(req,res)=>res.json(await diagnostics(req.params.id)));
tripsAdminRouter.get('/:id/public-view',async(req,res)=>{
 const trip=await load(req.params.id),state=await transaction(db=>snapshot(db,trip.id,trip.owner_id));
 await auditRequest(req,{action:'trip.public_style_view',targetType:'trip',targetId:trip.id});res.json(publicProjection({...state.trip,share_hide_stay:true},state.items));
});
const previews=new Map();
tripsAdminRouter.post('/:id/repair-preview',requireRecentAuth,async(req,res)=>{
 const reason=actionReason(req.body,'PREVIEW'),trip=await load(req.params.id),state=await transaction(db=>snapshot(db,trip.id,trip.owner_id));
 assert(state.places.length<=200,400,'Resolve oversized planning input before repair.');const result=scheduleItinerary(state),token=randomUUID();
 for(const [key,value]of previews)if(value.expires<Date.now()||value.actor===req.user.id)previews.delete(key);
 assert(previews.size<200,503,'Too many active previews. Retry later.');previews.set(token,{actor:req.user.id,tripId:trip.id,ownerId:trip.owner_id,before:revision(state),result,expires:Date.now()+10*60000});
 await auditRequest(req,{action:'trip.repair_preview',targetType:'trip',targetId:trip.id,reason});
 res.json({token,expiresInMinutes:10,summary:{before:state.items.length,after:result.items.length,conflicts:result.conflicts.length},preview:publicProjection({...state.trip,share_hide_stay:true},result.items),note:'Local recalculation preview. It replaces the schedule only when a super administrator applies it.'});
});
tripsAdminRouter.post('/:id/repair-apply',requireSuperAdmin,requireRecentAuth,async(req,res)=>{
 const reason=actionReason(req.body,'APPLY'),preview=previews.get(req.body.token);assert(preview&&preview.actor===req.user.id&&preview.tripId===req.params.id&&preview.expires>Date.now(),409,'Preview expired. Generate a new preview.');
 await transaction(async db=>{const state=await snapshot(db,preview.tripId,preview.ownerId,true);assert(revision(state)===preview.before,409,'The trip changed. Preview it again.');await persist(db,state,preview.result,{generation:'local',message:'Recalculated through an audited support repair.'});await auditRequest(req,{action:'trip.repair_apply',targetType:'trip',targetId:preview.tripId,reason},db);});previews.delete(req.body.token);res.json({ok:true});
});
tripsAdminRouter.post('/:id/delete',requireSuperAdmin,requireRecentAuth,async(req,res)=>{
 const reason=actionReason(req.body,'DELETE');const files=await transaction(async db=>{const trip=await load(req.params.id);await snapshot(db,trip.id,trip.owner_id,true);const files=await walletFilesForRemoval(db,'Trip',[trip.id],trip.owner_id);await db.execute('DELETE FROM trips WHERE id=? AND owner_id=?',[trip.id,trip.owner_id]);await auditRequest(req,{action:'trip.delete',targetType:'trip',targetId:trip.id,reason},db);return files;});await cleanupAfterRemoval(files);res.json({ok:true});
});
