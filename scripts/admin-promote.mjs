import { createInterface } from 'node:readline/promises';
import { pool, transaction } from '../server/db.js';
import { normalizeEmail } from '../server/security.js';
import { audit } from '../server/admin/audit.js';
import { masterKeyConfigured } from '../server/admin/crypto.js';
try {
 const email=normalizeEmail(process.argv[2]);
 if(!masterKeyConfigured())throw Error('Configure ADMIN_SECRETS_MASTER_KEY securely before promotion; MFA must remain available.');
 const [users]=await pool.execute('SELECT id,role,status,email_verified FROM users WHERE email=?',[email]);
 if(!users[0]||users[0].status!=='ACTIVE'||!users[0].email_verified)throw Error('An existing ACTIVE, email-verified account is required.');
 if(!process.stdin.isTTY)throw Error('Interactive confirmation is required. Run this command in your terminal.');
 const terminal=createInterface({input:process.stdin,output:process.stdout});
 const answer=await terminal.question('Promote this existing account to SUPER_ADMIN and revoke its sessions? Type PROMOTE '+email+': ');terminal.close();
 if(answer!=='PROMOTE '+email)throw Error('Confirmation did not match; no account changed.');
 await transaction(async db=>{
  await db.query("SELECT name FROM admin_locks WHERE name='privileged_accounts' FOR UPDATE");
  const [current]=await db.execute('SELECT id,role,status,email_verified FROM users WHERE id=? FOR UPDATE',[users[0].id]);
  if(current[0]?.status!=='ACTIVE'||!current[0].email_verified)throw Error('Account state changed; promotion cancelled.');
  await db.execute("UPDATE users SET role='SUPER_ADMIN' WHERE id=?",[users[0].id]);
  await db.execute('DELETE FROM sessions WHERE user_id=?',[users[0].id]);
  await audit(db,{action:'role.operator_promote',targetType:'user',targetId:users[0].id,reason:'Interactive server operator confirmation',metadata:{from_role:current[0].role,to_role:'SUPER_ADMIN'}});
 });console.log('Promotion recorded. Sign in normally, then open /admin and enroll MFA.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{await pool.end();}
