import { useState } from 'react';
import { adminApi } from '@/api/admin';
export default function AdminMfa({status,onVerified}) {
 const [password,setPassword]=useState(''),[code,setCode]=useState(''),[setup,setSetup]=useState(null),[recovery,setRecovery]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event){event.preventDefault();setBusy(true);setError('');try{
  if(!status.enabled&&!setup){setSetup(await adminApi('/mfa/setup','POST',{password}));}
  else {const result=await adminApi(status.enabled?'/mfa/verify':'/mfa/confirm','POST',{password,code});setPassword('');setCode('');setSetup(null);if(result.recoveryCodes)setRecovery(result.recoveryCodes);else onVerified();}
 }catch(failure){setError(failure.message);}finally{setBusy(false);}}
 return <section className="admin-card admin-auth"><p className="admin-eyebrow">Administrator security</p><h1>{recovery?'Save your recovery codes':status.enabled?'Verify your authenticator':'Set up two-factor authentication'}</h1>
 {!status.masterKeyConfigured&&<p role="alert">The server operator must configure ADMIN_SECRETS_MASTER_KEY before secure administration is available. Existing trips remain accessible.</p>}
 {recovery?<><p>These codes are shown once. Store them securely. Each code works once in place of an authenticator code.</p><pre className="admin-recovery">{recovery.join('\n')}</pre><button className="admin-button" onClick={onVerified}>I saved my recovery codes</button></>:<form onSubmit={submit}><p>Administrator operations require your password and an authenticator. Existing private file permissions remain unchanged.</p><label>Current password<input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{setup&&<><img className="admin-qr" src={setup.qr} alt="Authenticator enrollment QR code"/><p>Scan with your authenticator. If scanning is unavailable, enter this setup key manually:</p><code className="admin-secret">{setup.secret}</code></>}{(status.enabled||setup)&&<label>Authenticator or recovery code<input id="admin-code" autoComplete="one-time-code" required value={code} onChange={e=>setCode(e.target.value.trim())}/></label>}{error&&<p role="alert">{error}</p>}<button className="admin-button" disabled={busy||!status.masterKeyConfigured}>{busy?'Verifying…':status.enabled||setup?'Verify and continue':'Create authenticator setup'}</button></form>}
 </section>;
}
