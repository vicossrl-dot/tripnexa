import { Router } from 'express';
import { pool, transaction } from '../db.js';
import { assert } from '../errors.js';
import { actionReason, auditRequest } from '../admin/audit.js';
import { refreshTrip, publishSnapshot, canonicalFor } from './service.js';
import { destinationByKey } from './catalog.js';
import { sanitizeItinerary, seedState } from './sanitize.js';
export const publicItineraryAdmin=Router();
publicItineraryAdmin.get('/',async(req,res)=>{
  const page=Number(req.query.page||1);assert(Number.isInteger(page)&&page>=1&&page<=10000,400,'Invalid page.');
  const [[{total}]]=await pool.query('SELECT COUNT(*) AS total FROM public_itineraries');
  const [rows]=await pool.query(`SELECT p.*,u.public_itinerary_eligible AS source_eligible FROM public_itineraries p LEFT JOIN trips t ON t.id=p.source_trip_id LEFT JOIN users u ON u.id=t.owner_id ORDER BY p.updated_at DESC LIMIT 25 OFFSET ${(page-1)*25}`);
  res.json({page,total,items:rows.map(row=>({public_id:row.public_id,title:row.h1||'Awaiting publication',city:row.city||'Not yet classified',duration:row.duration_days,status:row.status,indexable:!!row.indexable,quality_score:row.quality_score,source_eligible:!!row.seed_key||!!row.source_eligible,source_kind:row.seed_key?'editorial':'community',reason:row.eligibility_reason,created_at:row.created_at,updated_at:row.updated_at,url:row.status==='published'?canonicalFor(row):null,admin_hidden:!!row.admin_hidden,forced_noindex:!!row.forced_noindex}))});
});
publicItineraryAdmin.post('/:id',async(req,res)=>{
  assert(/^[a-f0-9-]{36}$/.test(req.params.id),404,'Public itinerary not found.');
  const action=req.body.action;
  assert(['hide','noindex','regenerate','restore','allow-source'].includes(action),400,'Choose a supported action.');
  const reason=actionReason(req.body,'UPDATE');
  const saved=await transaction(async db=>{
    const [[row]]=await db.execute('SELECT * FROM public_itineraries WHERE public_id=? FOR UPDATE',[req.params.id]);assert(row,404,'Public itinerary not found.');
    if(action==='hide')await db.execute("UPDATE public_itineraries SET admin_hidden=TRUE,indexable=FALSE,status='hidden',eligibility_reason='admin_hidden',updated_at=CURRENT_TIMESTAMP(3) WHERE public_id=?",[row.public_id]);
    if(action==='noindex')await db.execute("UPDATE public_itineraries SET forced_noindex=TRUE,indexable=FALSE,eligibility_reason='admin_noindex',updated_at=CURRENT_TIMESTAMP(3) WHERE public_id=?",[row.public_id]);
    if(action==='restore')await db.execute('UPDATE public_itineraries SET admin_hidden=FALSE,forced_noindex=FALSE WHERE public_id=?',[row.public_id]);
    if(action==='allow-source'){
      assert(row.source_trip_id,400,'Editorial examples do not need account approval.');
      await db.execute("UPDATE users u JOIN trips t ON t.owner_id=u.id SET u.public_itinerary_eligible=TRUE WHERE t.id=? AND u.role='USER' AND u.status='ACTIVE'",[row.source_trip_id]);
    }
    await auditRequest(req,{action:'public_itinerary.'+action,targetType:'public_itinerary',targetId:row.public_id,reason},db);return row;
  });
  if(['restore','regenerate','allow-source'].includes(action)){
    if(saved.source_trip_id)await refreshTrip(saved.source_trip_id);
    else {const destination=destinationByKey(saved.city_key);assert(destination,409,'Editorial source not found.');await transaction(db=>publishSnapshot(db,sanitizeItinerary(seedState(destination),{seed:true}),{seedKey:saved.seed_key}));}
  }
  res.json({ok:true});
});
