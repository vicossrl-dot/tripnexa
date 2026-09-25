import { useEffect,useState } from 'react';
import { Link,Route,Routes } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { adminApi } from '@/api/admin';
import AdminLayout from '@/components/admin/AdminLayout';
import AdminMfa from '@/components/admin/AdminMfa';
import AdminFiles from '@/components/admin/AdminFiles';
import AdminAffiliates from '@/components/admin/AdminAffiliates';
import {AdminDomains,AdminAuthentication} from '@/components/admin/AdminAuthentication';
import {DataTable} from '@/components/admin/AdminCommon';
import {AdminDashboard,AdminAnalytics,AdminUser,AdminTrip,AdminHealth} from '@/components/admin/AdminOperations';
import {AdminSettings,AdminProviders,AdminEmail} from '@/components/admin/AdminConfiguration';
import '@/styles/admin.css';
export default function Admin(){
 const {user}=useAuth();const [status,setStatus]=useState(null),[error,setError]=useState('');
 const allowed=['ADMIN','SUPER_ADMIN'].includes(user?.role);
 async function load(){setError('');try{setStatus(await adminApi('/mfa/status'));}catch(failure){setError(failure.message);}}
 useEffect(()=>{if(allowed)load();},[allowed]);
 if(!allowed)return <div className="admin-denied"><h1>Access restricted</h1><p>Your account does not have administrator access.</p><Link to="/">Return to trips</Link></div>;
 if(error)return <div className="admin-denied"><h1>Administration unavailable</h1><p role="alert">{error}</p><button onClick={load}>Retry</button></div>;
 if(!status)return <div className="admin-denied" role="status">Checking administrator access…</div>;
 if(!status.verified)return <div className="admin-shell admin-enrollment"><AdminMfa status={status} onVerified={load}/><Link to="/">Return to trips</Link></div>;
 return <AdminLayout><Routes>
  <Route index element={<AdminDashboard/>}/>
  <Route path="domains" element={<AdminDomains/>}/><Route path="authentication" element={<AdminAuthentication/>}/>
  <Route path="users" element={<DataTable title="Users" description="Account management with server-enforced permissions." path="/users" detailBase="/admin/users" columns={['email','display_name','email_verified','role','status','created_date','last_activity','trips_count','upload_count','storage_bytes'].map(key=>({key}))} sorts={['created','email','name','role','status']} filters={[{key:'role',label:'Role',options:['USER','ADMIN','SUPER_ADMIN']},{key:'status',label:'Status',options:['ACTIVE','SUSPENDED','DISABLED','PENDING_DELETION']},{key:'verified',label:'Verified',options:['true','false']}]}/>}/>
  <Route path="users/:id" element={<AdminUser/>}/>
  <Route path="trips" element={<DataTable title="Trips" description="Global summaries. Private documents are not included." path="/trips" detailBase="/admin/trips" columns={['name','destination','owner_email','start_date','end_date','plan_status','itinerary_count','share_enabled','created_date'].map(key=>({key}))} sorts={['created','updated','name','destination']} filters={[{key:'shared',label:'Shared',options:['true','false']},{key:'itinerary',label:'Itinerary',options:['true','false']},{key:'review',label:'Needs review',options:['true']}]}/>}/>
  <Route path="trips/:id" element={<AdminTrip/>}/>
  <Route path="files" element={<AdminFiles/>}/>
  <Route path="tours-tickets" element={<AdminAffiliates/>}/><Route path="referrals" element={<AdminAffiliates initial="mappings"/>}/><Route path="affiliate-analytics" element={<AdminAffiliates initial="analytics"/>}/>
  <Route path="analytics" element={<AdminAnalytics/>}/>
  <Route path="health" element={<AdminHealth/>}/><Route path="security" element={<AdminHealth security/>}/>
  <Route path="ai" element={<AdminProviders/>}/><Route path="integrations" element={<AdminProviders/>}/>
  <Route path="email" element={<AdminEmail/>}/>
  <Route path="settings" element={<AdminSettings/>}/><Route path="branding" element={<AdminSettings section="branding" title="Branding"/>}/>
  <Route path="features" element={<AdminSettings section="features" title="Feature flags"/>}/><Route path="limits" element={<AdminSettings section="quotas" title="Limits & quotas"/>}/>
  <Route path="audit" element={<DataTable title="Audit" description="Read-only record of privileged actions. No editing or deletion." path="/audit" columns={['created_at','action','actor_user_id','actor_role','target_type','target_id','result','reason','request_id'].map(key=>({key}))} filters={[{key:'result',label:'Result',options:['success','failure']}]}/>}/>
  <Route path="logs" element={<DataTable title="Application logs" description="Sanitized operational events. No private file or prompt content." path="/logs" columns={['created_at','level','category','event','status','duration_ms','request_id'].map(key=>({key}))} filters={[{key:'level',label:'Level',options:['info','warning','error']},{key:'category',label:'Category',options:['auth','api','ai','google','email','upload','pdf','planning','security','system']}]}/>}/>
  <Route path="*" element={<div className="admin-card"><h1>Configuration and operations</h1><p>This section is being connected in the next implementation stage.</p></div>}/>
 </Routes></AdminLayout>;
}
