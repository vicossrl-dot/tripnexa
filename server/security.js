import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { assert } from './errors.js';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const secretToken = () => randomBytes(32).toString('hex');
export async function hashPassword(password) {
  assert(typeof password === 'string' && password.length >= 12 && password.length <= 128, 400, 'Use a password between 12 and 128 characters.');
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [, salt, stored] = (encoded || '').split(':');
  const hash = await scrypt(password, salt || 'missing-account-timing-salt', 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return Boolean(stored && stored.length === 128 && timingSafeEqual(hash, Buffer.from(stored, 'hex')));
}
export function normalizeEmail(email) {
  assert(typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), 400, 'Enter a valid email address.');
  return email.trim().toLowerCase();
}
export function sessionToken(req) {
  const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('tripsync_session='))?.slice(17);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}
