import {Router} from 'express';
import {pool,transaction} from '../db.js';
import {assert} from '../errors.js';
import {issueToken} from '../auth.js';
import {auditRequest,actionReason} from './audit.js';
import {canManage,ROLES,requireRecentAuth,requireSuperAdmin} from './permissions.js';
import {paging,searchTerm} from './query.js';
const fields=`u.id,u.email,u.display_name,u.created_date,u.email_verified,u.role,u.status,u.home_city,u.password_hash IS NOT NULL AS password_sign_in,(SELECT COUNT(*) FROM user_identities i WHERE i.user_id=u.id AND i.provider='google') AS google_sign_in,(SELECT COUNT(*) FROM user_identities i WHERE i.user_id=u.id AND i.provider='apple') AS apple_sign_in`;
const counts=`(SELECT COUNT(*) FROM trips t WHERE t.owner_id=u.id) AS trips_count,
 (SELECT COUNT(*) FROM uploads f WHERE f.owner_id=u.id) AS upload_count,
 (SELECT COALESCE(SUM(size_bytes),0) FROM uploads f WHERE f.owner_id=u.id) AS storage_bytes,
 (SELECT COUNT(*) FROM uploads f WHERE f.owner_id=u.id AND size_bytes IS NULL) AS storage_unmeasured,
 (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id=u.id) AS last_activity`;
export const usersRouter=Router();
usersRouter.get('/',async(req,res)=>{
 const p=paging(req.query,{created:'u.created_date',name:'u.display_name',email:'u.email',role:'u.role',status:'u.status'},'created'),where=['1=1'],args=[];
 if(req.query.q){where.push('(u.email LIKE ? OR u.display_name LIKE ? OR u.id=?)');args.push('%'+searchTerm(req.query.q)+'%','%'+searchTerm(req.query.q)+'%',searchTerm(req.query.q));}
 for(const key of ['role','status'])if(req.query[key]){where.push(`u.${key}=?`);args.push(String(req.query[key]));}
 if(['true','false'].includes(req.query.verified)){where.push('u.email_verified=?');args.push(req.query.verified==='true');}
 const clause=where.join(' AND '),[[count]]=await pool.execute('SELECT COUNT(*) AS total FROM users u WHERE '+clause,args);
 const [items]=await pool.execute(`SELECT ${fields},${counts} FROM users u WHERE ${clause}${p.order}${p.limit}`,args);res.json({items,total:count.total,page:p.page,pageSize:p.size});
});
usersRouter.get('/:id',async(req,res)=>{
 const [rows]=await pool.execute(`SELECT ${fields},${counts} FROM users u WHERE u.id=?`,[req.params.id]);assert(rows[0],404,'User not found.');
 const [sessions]=await pool.execute('SELECT id,created_at,last_seen_at,device_summary,mfa_verified_at IS NOT NULL AS mfa_verified,expires_at FROM sessions WHERE user_id=? AND expires_at>UTC_TIMESTAMP() ORDER BY created_at DESC LIMIT 100',[req.params.id]);
 const [trips]=await pool.execute('SELECT id,name,destination,start_date,end_date,plan_status FROM trips WHERE owner_id=? ORDER BY created_date DESC LIMIT 25',[req.params.id]);
 const [activity]=await pool.execute('SELECT action,result,created_at FROM audit_events WHERE actor_user_id=? OR target_id=? ORDER BY created_at DESC LIMIT 25',[req.params.id,req.params.id]);
 res.json({user:rows[0],sessions,trips,activity});
});
export async function changeUser(req,action){
 const reason=actionReason(req.body,action.toUpperCase());
 return transaction(async db=>{
  await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");
  const [actors]=await db.execute('SELECT id,role,status FROM users WHERE id=? FOR UPDATE',[req.user.id]);
  const actor=actors[0];assert(actor?.status==='ACTIVE'&&['ADMIN','SUPER_ADMIN'].includes(actor.role),403,'Administrator access is unavailable.');
  const [rows]=await db.execute('SELECT id,role,status,email,email_verified FROM users WHERE id=? FOR UPDATE',[req.params.id]);const target=rows[0];assert(target,404,'User not found.');assert(canManage(actor,target),403,'This account requires a super administrator.');
  if(['role','disable'].includes(action))assert(actor.role==='SUPER_ADMIN',403,'Super administrator access is required.');
  assert(actor.id!==target.id||action==='role',400,'Use another administrator for actions on your own account.');
  let role=target.role,status=target.status;
  if(action==='role'){assert(ROLES.includes(req.body.role),400,'Invalid role.');role=req.body.role;assert(target.email_verified||role==='USER',409,'Verify the email before granting administrator access.');}
  if(action==='suspend')status='SUSPENDED';if(action==='reactivate')status='ACTIVE';if(action==='disable')status='DISABLED';
  if(target.role==='SUPER_ADMIN'&&target.status==='ACTIVE'&&(role!=='SUPER_ADMIN'||status!=='ACTIVE')){
   const [[count]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE role='SUPER_ADMIN' AND status='ACTIVE'");assert(count.n>1,409,'The last active super administrator must remain active.');
  }
  if(['suspend','reactivate','disable','role'].includes(action))await db.execute('UPDATE users SET role=?,status=?,suspended_at=?,suspended_by=?,suspension_reason=? WHERE id=?',[role,status,status==='ACTIVE'?null:new Date(),status==='ACTIVE'?null:actor.id,status==='ACTIVE'?null:reason,target.id]);
  if(action==='revoke-session'){assert(typeof req.body.session_id==='string',400,'Choose a session.');await db.execute('DELETE FROM sessions WHERE user_id=? AND id=?',[target.id,req.body.session_id]);}
  else if(action!=='password-reset')await db.execute('DELETE FROM sessions WHERE user_id=?',[target.id]);
  await auditRequest(req,{action:'user.'+action,targetType:'user',targetId:target.id,reason,metadata:{from_role:target.role,to_role:role,from_status:target.status,to_status:status}},db);
  return target;
 });
}
for(const action of ['suspend','reactivate','disable','role','revoke-sessions','revoke-session','password-reset'])usersRouter.post('/:id/'+action,requireRecentAuth,...(['role','disable'].includes(action)?[requireSuperAdmin]:[]),async(req,res)=>{
 const target=await changeUser(req,action);if(action==='password-reset')await issueToken(target,'reset');res.json({ok:true});
});
usersRouter.patch('/:id/role',requireSuperAdmin,requireRecentAuth,async(req,res)=>{await changeUser(req,'role');res.json({ok:true});});
