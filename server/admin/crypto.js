import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { assert } from '../errors.js';

export function masterKeyConfigured() { return /^[a-fA-F0-9]{64}$/.test(process.env.ADMIN_SECRETS_MASTER_KEY || ''); }
function key() {
  assert(masterKeyConfigured(), 503, 'Secure administration requires ADMIN_SECRETS_MASTER_KEY on the server.');
  return Buffer.from(process.env.ADMIN_SECRETS_MASTER_KEY, 'hex');
}
export function encryptSecret(value, context) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { version: 1, ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
export function decryptSecret(value, context) {
  const envelope = typeof value === 'string' ? JSON.parse(value) : value;
  assert(envelope?.version === 1, 503, 'Encrypted configuration is unavailable.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch { assert(false, 503, 'Encrypted configuration cannot be unlocked. Check the server master key.'); }
}
