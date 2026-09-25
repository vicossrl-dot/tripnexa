import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { assert } from '../errors.js';

export const redactText = value => String(value || '').replace(/(?:sk-[\w-]+|Bearer\s+\S+|[a-f0-9]{64}|(?:password|secret|token|api[_ -]?key)\s*[:=]\s*\S+)/gi, '[redacted]').slice(0,500);
export function actionReason(body, confirmation) {
  assert(typeof body?.reason === 'string' && body.reason.trim().length >= 5 && body.reason.length <= 500, 400, 'Provide a reason (5–500 characters). Do not include confidential information.');
  assert(body.confirmation === confirmation, 400, `Type ${confirmation} to confirm this action.`);
  return redactText(body.reason.trim());
}
export async function audit(db = pool, { actor = null, action, targetType = null, targetId = null, result = 'success', reason = null, requestId = null, metadata = {} }) {
  // Call sites construct narrow metadata. Do not pass request bodies, user objects or provider responses.
  const safe = {};
  for (const key of ['from_role','to_role','from_status','to_status','count','version','setting','provider','changed','code','job_type','source','old_value','new_value']) {
    if (['string','number','boolean'].includes(typeof metadata[key])) safe[key] = typeof metadata[key] === 'string' ? redactText(metadata[key]) : metadata[key];
  }
  await db.execute('INSERT INTO audit_events(id,actor_user_id,actor_role,action,target_type,target_id,result,reason,request_id,metadata_redacted) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [randomUUID(),actor?.id || null,actor?.role || null,action,targetType,targetId,result,reason ? redactText(reason) : null,requestId,JSON.stringify(safe)]);
}
export const auditRequest = (req, details, db = pool) => audit(db,{actor:req.user,requestId:req.requestId||null,...details});
