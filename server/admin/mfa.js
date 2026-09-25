import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { pool, transaction } from '../db.js';
import { assert } from '../errors.js';
import { verifyPassword, digest } from '../security.js';
import { encryptSecret, decryptSecret, masterKeyConfigured } from './crypto.js';
import { auditRequest } from './audit.js';
import { requirePrivileged, requireRecentAuth } from './permissions.js';

const totp = (secret,email='TripSync administrator') => new OTPAuth.TOTP({issuer:'TripSync',label:email,algorithm:'SHA1',digits:6,period:30,secret:OTPAuth.Secret.fromBase32(secret)});
export function validCounter(secret,code,last=-1,now=Date.now()) {
  if(typeof code!=='string'||!/^\d{6}$/.test(code))return null;
  const delta=totp(secret).validate({token:code,window:1,timestamp:now});
  const counter=Math.floor(now/30000)+(delta??0);return delta!==null&&counter>last?counter:null;
}
const parse = value => typeof value==='string'?JSON.parse(value):value;
const codes = () => Array.from({length:10},()=>randomBytes(16).toString('hex'));
export const mfaRouter=Router();
mfaRouter.use(requirePrivileged);
mfaRouter.use(rateLimit({windowMs:15*60000,limit:30,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false}));
mfaRouter.get('/status',async(req,res)=>{
  const [rows]=await pool.execute('SELECT enabled FROM admin_mfa WHERE user_id=?',[req.user.id]);
  res.json({enabled:!!rows[0]?.enabled,verified:!!req.session?.mfa_verified_at,masterKeyConfigured:masterKeyConfigured(),role:req.user.role});
});
mfaRouter.post('/setup',async(req,res)=>{
  assert(await verifyPassword(req.body.password,req.user.password_hash),401,'Confirm your current password.');
  const secret=new OTPAuth.Secret({size:20}).base32;
  const encrypted=JSON.stringify(encryptSecret(secret,'mfa:'+req.user.id));
  await transaction(async db=>{
    await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[req.user.id]);
    const [rows]=await db.execute('SELECT enabled FROM admin_mfa WHERE user_id=? FOR UPDATE',[req.user.id]);
    assert(!rows[0]?.enabled,409,'MFA is already configured. Use your authenticator or recovery code.');
    await db.execute('INSERT INTO admin_mfa(user_id,encrypted_secret,pending_secret,pending_expires_at) VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)) ON DUPLICATE KEY UPDATE pending_secret=VALUES(pending_secret),pending_expires_at=VALUES(pending_expires_at)',[req.user.id,encrypted,encrypted]);
    await auditRequest(req,{action:'mfa.setup_started',targetType:'user',targetId:req.user.id},db);
  });
  // Enrollment material is returned once on POST only; no existing MFA secret can be retrieved.
  res.json({qr:await QRCode.toDataURL(totp(secret,req.user.email).toString()),secret,expiresInMinutes:10});
});
async function verify(req, enrollment=false) {
  const recoveryCodes=enrollment?codes():null;
  const result=await transaction(async db=>{
    const [users]=await db.execute('SELECT role,status,password_hash FROM users WHERE id=? FOR UPDATE',[req.user.id]);
    assert(users[0]?.status==='ACTIVE'&&['ADMIN','SUPER_ADMIN'].includes(users[0].role),403,'Administrator access is unavailable.');
    const [rows]=await db.execute('SELECT *, locked_until>UTC_TIMESTAMP() AS locked, pending_expires_at>UTC_TIMESTAMP() AS pending_valid FROM admin_mfa WHERE user_id=? FOR UPDATE',[req.user.id]);
    const row=rows[0];assert(row,400,'Set up your authenticator first.');assert(!row.locked,429,'Too many attempts. Retry in 15 minutes.');
    const passwordValid=await verifyPassword(req.body.password,users[0].password_hash);
    let counter=null,recoveryIndex=-1;
    const hashes=parse(row.recovery_hashes)||[];
    if(passwordValid&& (enrollment ? !row.enabled&&row.pending_valid : row.enabled)) {
      counter=validCounter(decryptSecret(enrollment?row.pending_secret:row.encrypted_secret,'mfa:'+req.user.id),req.body.code,Number(row.last_counter));
      if(!enrollment&&typeof req.body.code==='string'&&/^[a-f0-9]{32}$/.test(req.body.code))recoveryIndex=hashes.indexOf(digest(req.user.id+':'+req.body.code));
    }
    if(counter===null&&recoveryIndex<0){
      await db.execute('UPDATE admin_mfa SET failures=failures+1,locked_until=IF(failures>=5,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),NULL) WHERE user_id=?',[req.user.id]);
      await auditRequest(req,{action:'mfa.verify',result:'failure',targetType:'user',targetId:req.user.id},db);return false;
    }
    if(recoveryIndex>=0)hashes.splice(recoveryIndex,1);
    await db.execute('UPDATE admin_mfa SET encrypted_secret=?,pending_secret=NULL,pending_expires_at=NULL,enabled=TRUE,last_counter=?,recovery_hashes=?,failures=0,locked_until=NULL WHERE user_id=?',[
      JSON.stringify(parse(enrollment?row.pending_secret:row.encrypted_secret)),counter??row.last_counter,JSON.stringify(enrollment?recoveryCodes.map(code=>digest(req.user.id+':'+code)):hashes),req.user.id]);
    const [update]=await db.execute('UPDATE sessions SET mfa_verified_at=UTC_TIMESTAMP(3),authenticated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND expires_at>UTC_TIMESTAMP()',[req.session.id,req.user.id]);
    assert(update.affectedRows,401,'Please sign in again.');
    await auditRequest(req,{action:enrollment?'mfa.enrolled':'mfa.verify',targetType:'user',targetId:req.user.id,metadata:{source:recoveryIndex>=0?'recovery':'totp'}},db);return true;
  });
  assert(result,401,'Password or one-time code is invalid, expired, or already used.');return recoveryCodes;
}
mfaRouter.post('/confirm',async(req,res)=>res.json({ok:true,recoveryCodes:await verify(req,true)}));
mfaRouter.post('/verify',async(req,res)=>{await verify(req);res.json({ok:true});});
mfaRouter.post('/recovery-codes',requireRecentAuth,async(req,res)=>{
  assert(req.body.confirmation==='REGENERATE',400,'Type REGENERATE to invalidate old recovery codes.');
  const recoveryCodes=codes();await transaction(async db=>{
    const [result]=await db.execute('UPDATE admin_mfa SET recovery_hashes=? WHERE user_id=? AND enabled=TRUE',[JSON.stringify(recoveryCodes.map(code=>digest(req.user.id+':'+code))),req.user.id]);
    assert(result.affectedRows,409,'Set up MFA first.');await auditRequest(req,{action:'mfa.recovery_regenerated',targetType:'user',targetId:req.user.id},db);
  });res.json({recoveryCodes});
});
