import {randomUUID} from 'node:crypto';
import {pool,transaction} from '../db.js';
import {billingSettings} from './configuration.js';
import {tripAccess,requireFeature,lockUser} from './entitlements.js';
import {BillingError} from './catalog.js';
import {recordEvent} from '../admin/telemetry.js';

export async function billableOperation(userId,tripId,operation,work){
 const settings=await billingSettings();let id=null,completed=false;
 try{
  await transaction(async db=>{
   await lockUser(db,userId);let premium=!settings.billing_enforcement_enabled;
   if(tripId)premium=(await tripAccess(db,userId,tripId,settings)).premium;
   if(['pdf_exports','ai_document_extractions','smart_repair','advanced_ai'].includes(operation))await requireFeature(userId,operation,tripId,db,settings);
   if(settings.billing_enforcement_enabled&&!premium&&['ai_generations','ai_modifications'].includes(operation)){
    const limit=operation==='ai_generations'?1:settings.billing_free_ai_modifications;
    const [[usage]]=await db.execute("SELECT COUNT(*) AS used FROM billing_operations WHERE user_id=? AND trip_id=? AND operation=? AND status IN ('reserved','succeeded')",[userId,tripId,operation]);
    if(usage.used>=limit)throw new BillingError('AI_LIMIT_REACHED',operation,'You have used your free AI planning allowance.',{tripId,used:usage.used,limit});
   }
   id=randomUUID();await db.execute("INSERT INTO billing_operations(id,user_id,trip_id,operation,mode,status)VALUES(?,?,?,?,?,'reserved')",[id,userId,tripId,operation,settings.billing_mode]);
  });
  const result=await work();completed=true;await pool.execute("UPDATE billing_operations SET status='succeeded' WHERE id=?",[id]);return result;
 }catch(error){if(id&&!completed)await pool.execute("UPDATE billing_operations SET status='failed' WHERE id=?",[id]).catch(()=>{});if(error.billing)void recordEvent('premium_feature_blocked',userId);throw error;}
}
