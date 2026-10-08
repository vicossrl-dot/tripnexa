import {readSettings} from '../admin/settings.js';
import {runtimeSettings} from '../admin/runtime.js';
import {pool} from '../db.js';
import {decryptSecret} from '../admin/crypto.js';
import {PLANS} from './catalog.js';
export async function billingSettings(){return (runtimeSettings()||await readSettings()).settings;}
export async function billingSecret(name){const [[row]]=await pool.execute('SELECT encrypted_value FROM managed_secrets WHERE secret_name=?',[name]);return row?decryptSecret(row.encrypted_value,'provider:'+name):process.env[name]||'';}
export const priceKey=code=>'stripe_price_'+code.toLowerCase();
export function publicCatalog(settings){return {enabled:settings.billing_enabled,enforcement:settings.billing_enforcement_enabled,mode:settings.billing_mode,free:{trips:1,wallet:4,ai_generations:1,ai_modifications:settings.billing_free_ai_modifications},premium:{wallet:settings.billing_premium_wallet_files},plans:Object.values(PLANS).map(p=>({...p,available:!!settings[priceKey(p.code)]&&settings.billing_enabled}))};}
