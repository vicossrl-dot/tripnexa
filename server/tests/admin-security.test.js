import test from 'node:test';
import assert from 'node:assert/strict';
import * as OTPAuth from 'otpauth';
import { randomBytes } from 'node:crypto';
import { encryptSecret,decryptSecret,masterKeyConfigured } from '../admin/crypto.js';
import { validCounter } from '../admin/mfa.js';
import { serialize,validateData } from '../schema.js';
test('Admin AES-GCM binds encrypted secrets to context and fails closed without a key or on tampering',()=>{
 const previous=process.env.ADMIN_SECRETS_MASTER_KEY;process.env.ADMIN_SECRETS_MASTER_KEY=randomBytes(32).toString('hex');
 try{const value=encryptSecret('PRIVATE_TEST_VALUE','mfa:user-one');assert(!JSON.stringify(value).includes('PRIVATE_TEST_VALUE'));assert.equal(decryptSecret(value,'mfa:user-one'),'PRIVATE_TEST_VALUE');assert.throws(()=>decryptSecret(value,'mfa:user-two'));assert.throws(()=>decryptSecret({...value,tag:Buffer.alloc(16).toString('base64')},'mfa:user-one'));delete process.env.ADMIN_SECRETS_MASTER_KEY;assert.equal(masterKeyConfigured(),false);assert.throws(()=>encryptSecret('a','b'));}finally{if(previous)process.env.ADMIN_SECRETS_MASTER_KEY=previous;else delete process.env.ADMIN_SECRETS_MASTER_KEY;}
});
test('Admin TOTP checks an RFC-derived code and prevents replay',()=>{
 const secret=OTPAuth.Secret.fromUTF8('12345678901234567890').base32;
 assert.equal(validCounter(secret,'287082',-1,59000),1);assert.equal(validCounter(secret,'287082',1,59000),null);assert.equal(validCounter(secret,'wrong',-1,59000),null);
});
test('User profile cannot expose security fields or grant roles',()=>{
 const user=serialize('User',{id:'one',role:'SUPER_ADMIN',status:'ACTIVE',email:'example@test.invalid',password_hash:'PRIVATE',session_id:'PRIVATE',mfa_verified_at:'PRIVATE',suspension_reason:'PRIVATE'});
 assert.equal(user.role,'SUPER_ADMIN');assert(!JSON.stringify(user).includes('PRIVATE'));assert.throws(()=>validateData('User',{role:'SUPER_ADMIN'},true));assert.throws(()=>validateData('User',{status:'ACTIVE'},true));
});
