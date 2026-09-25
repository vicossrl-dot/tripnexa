import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { randomInt, randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { config } from './config.js';
import { assert } from './errors.js';
import { digest, secretToken, hashPassword, verifyPassword, normalizeEmail, sessionToken } from './security.js';
import { sendMail } from './mail.js';
import { serialize, validateData } from './schema.js';
import { privileged } from './admin/permissions.js';
import { auditRequest } from './admin/audit.js';
import {runtimeSettings} from './admin/runtime.js';
import {readSettings} from './admin/settings.js';
import {getAppUrls,buildPasswordResetUrl,buildEmailVerificationUrl} from './app-urls.js';

const cookie = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };
export async function loadUser(req, _res, next) {
  try {
    const token = sessionToken(req);
    if (token) {
      const [rows] = await pool.execute('SELECT u.*,s.id AS session_id,s.authenticated_at,s.mfa_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()', [digest(token)]);
      const user=rows[0];
      req.user = user?.status==='ACTIVE'?user:null;
      if(req.user){req.session={id:user.session_id,authenticated_at:user.authenticated_at,mfa_verified_at:user.mfa_verified_at};await pool.execute('UPDATE sessions SET last_seen_at=UTC_TIMESTAMP(3) WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<UTC_TIMESTAMP()-INTERVAL 5 MINUTE)',[user.session_id]);}
    }
    next();
  } catch (error) { next(error); }
}
export function requireUser(req, _res, next) {
  try { assert(req.user, 401, 'Please sign in.'); next(); } catch (error) { next(error); }
}
export async function startSession(db, userId, req, res) {
  const [accounts]=await db.execute('SELECT status FROM users WHERE id=?',[userId]);
  assert(accounts[0]?.status==='ACTIVE',403,'This account is not active.');
  const old = sessionToken(req);
  if (old) await db.execute('DELETE FROM sessions WHERE token_hash=?', [digest(old)]);
  const token = secretToken();
  const device=/Edg\//.test(req.get('User-Agent')||'')?'Edge':/Firefox\//.test(req.get('User-Agent')||'')?'Firefox':/Chrome\//.test(req.get('User-Agent')||'')?'Chrome':'Other';
  const policy=(runtimeSettings()||await readSettings()).settings,days=policy.session_days||7,maximum=policy.max_sessions_per_user||10;
  const [sessions]=await db.execute('SELECT id FROM sessions WHERE user_id=? ORDER BY created_at DESC',[userId]);for(const session of sessions.slice(maximum-1))await db.execute('DELETE FROM sessions WHERE id=? AND user_id=?',[session.id,userId]);
  await db.execute('INSERT INTO sessions (token_hash,user_id,expires_at,id,authenticated_at,last_seen_at,device_summary) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? DAY),?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),?)', [digest(token), userId,days,randomUUID(),device]);
  res.cookie('tripsync_session', token, { ...cookie, maxAge: days * 86400000 });
}
export async function issueToken(user, kind) {
  const token = kind === 'verify' ? String(randomInt(100000, 1000000)) : secretToken();
  await pool.execute('INSERT INTO auth_tokens (user_id,kind,token_hash,expires_at,attempts) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE),0) ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),expires_at=VALUES(expires_at),attempts=0', [user.id, kind, digest(`${user.id}:${kind}:${token}`)]);
  const urls=await getAppUrls();
  const text = kind === 'verify' ? `Your TripSync verification code: ${token}\nEnter it at ${buildEmailVerificationUrl(urls,user.email)}\nExpires in 15 minutes.` : `Reset your TripSync password: ${buildPasswordResetUrl(urls,token,user.id)}\nExpires in 15 minutes. Ignore this message if you did not request it.`;
  await sendMail(user.email, kind === 'verify' ? 'Verify your TripSync email' : 'Reset your TripSync password', text);
}
export const authRouter = Router();
const authLimit = rateLimit({ windowMs: 15 * 60000, limit: () => Math.min(30,runtimeSettings()?.settings.login_attempt_limit||30), standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Please try again in 15 minutes.' } });
authRouter.get('/me', requireUser, (req, res) => res.json(serialize('User', req.user)));
authRouter.patch('/me', requireUser, async (req, res) => {
  const data = validateData('User', req.body, true);
  const keys = Object.keys(data);
  if (keys.length) await pool.execute(`UPDATE users SET ${keys.map(k => `\`${k}\`=?`).join(',')} WHERE id=?`, [...Object.values(data), req.user.id]);
  const [rows] = await pool.execute('SELECT * FROM users WHERE id=?', [req.user.id]);
  res.json(serialize('User', rows[0]));
});
authRouter.post('/logout', async (req, res) => {
  const token = sessionToken(req);
  if (token) await pool.execute('DELETE FROM sessions WHERE token_hash=?', [digest(token)]);
  res.clearCookie('tripsync_session', cookie).json({ ok: true });
});
authRouter.use(authLimit);
authRouter.post('/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const passwordHash = await hashPassword(req.body.password);
  const [existing] = await pool.execute('SELECT * FROM users WHERE email=?', [email]);
  if (existing.length) {
    if (!existing[0].email_verified) await issueToken(existing[0], 'verify');
    return res.json({ verificationRequired: true });
  }
  const user = { id: randomUUID(), email };
  try { await pool.execute('INSERT INTO users (id,email,password_hash) VALUES (?,?,?)', [user.id, email, passwordHash]); }
  catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.json({ verificationRequired: true }); throw error; }
  await issueToken(user, 'verify');
  res.status(201).json({ verificationRequired: true });
});
authRouter.post('/verify', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  assert(typeof req.body.otpCode === 'string' && /^\d{6}$/.test(req.body.otpCode), 400, 'Enter the six-digit code.');
  const valid = await transaction(async db => {
    const [rows] = await db.execute("SELECT t.*, u.email FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE u.email=? AND t.kind='verify' AND t.expires_at>UTC_TIMESTAMP() FOR UPDATE", [email]);
    const token = rows[0];
    if (!token || token.attempts >= 5) return false;
    if (token.token_hash !== digest(`${token.user_id}:verify:${req.body.otpCode}`)) {
      await db.execute("UPDATE auth_tokens SET attempts=attempts+1 WHERE user_id=? AND kind='verify'", [token.user_id]);
      return false;
    }
      await db.execute('UPDATE users SET email_verified=TRUE WHERE id=?', [token.user_id]);
    await db.execute("DELETE FROM auth_tokens WHERE user_id=? AND kind='verify'", [token.user_id]);
    await startSession(db, token.user_id, req, res);
    return true;
  });
  assert(valid, 400, 'Invalid or expired code. Request a new code.');
  res.json({ ok: true });
});
authRouter.post('/resend', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email=? AND email_verified=FALSE', [normalizeEmail(req.body.email)]);
  if (rows[0]) await issueToken(rows[0], 'verify');
  res.json({ ok: true });
});
authRouter.post('/login', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [normalizeEmail(req.body.email)]);
  const user = rows[0];
  const valid = await verifyPassword(req.body.password, user?.password_hash);
  if(privileged(user))await auditRequest(req,{actor:user,action:'auth.admin_login',targetType:'user',targetId:user.id,result:valid&&user.status==='ACTIVE'?'success':'failure'});
  assert(valid && user, 401, 'Incorrect email or password.');
  assert(user.status==='ACTIVE',403,'This account is not active.');
  assert(user.email_verified, 403, 'Verify your email first. Use registration to request a new code.');
  await startSession(pool, user.id, req, res);
  res.json(serialize('User', user));
});
authRouter.post('/forgot-password', async (req, res) => {
  const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [normalizeEmail(req.body.email)]);
  if (rows[0]) await issueToken(rows[0], 'reset');
  res.json({ ok: true });
});
authRouter.post('/reset-password', async (req, res) => {
  const { userId, resetToken, newPassword } = req.body;
  assert(typeof userId === 'string' && typeof resetToken === 'string' && /^[a-f0-9]{64}$/.test(resetToken), 400, 'Invalid reset link.');
  const passwordHash = await hashPassword(newPassword);
  await transaction(async db => {
    const [tokens] = await db.execute("SELECT * FROM auth_tokens WHERE user_id=? AND kind='reset' AND token_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE", [userId, digest(`${userId}:reset:${resetToken}`)]);
    assert(tokens.length, 400, 'Invalid or expired reset link.');
    await db.execute('UPDATE users SET password_hash=?,email_verified=TRUE WHERE id=?', [passwordHash, userId]);
    await db.execute('DELETE FROM auth_tokens WHERE user_id=?', [userId]);
    await db.execute('DELETE FROM sessions WHERE user_id=?', [userId]);
  });
  res.clearCookie('tripsync_session', cookie).json({ ok: true });
});
