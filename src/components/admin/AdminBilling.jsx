import {StripeSetup} from './IntegrationSetup';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '@/lib/AuthContext';
import {adminApi} from '@/api/admin';
import {ActionDialog,PageTitle,LoadState,KeyValues,useAdminData} from './AdminCommon';
import {AdminSettings} from './AdminConfiguration';

function Rows({items}) { return !items?.length ? <p>No recorded data.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{Object.keys(items[0]).map(k=><th key={k}>{k.replaceAll('_',' ')}</th>)}</tr></thead><tbody>{items.map((row,i)=><tr key={i}>{Object.entries(row).map(([k,v])=><td key={k}>{v===null?'—':String(v)}</td>)}</tr>)}</tbody></table></div>; }
function Reconcile({user,onDone}){
 const [open,setOpen]=useState(false),[customer,setCustomer]=useState(''),[checkout,setCheckout]=useState('');
 return <><button className="admin-button secondary" onClick={()=>setOpen(true)}>Reconcile Stripe customer / checkout</button>{open&&<ActionDialog title="Reconcile Stripe records" target={user.email} impact="Use IDs verified in Stripe Dashboard after an interrupted checkout. Server-side metadata must match this user and the existing order. No unverified purchase is granted." path={'/billing/users/'+user.id+'/reconcile'} confirmation="SYNC" extra={{customer_id:customer,checkout_id:checkout}} fields={<><label>Stripe customer ID<input value={customer} onChange={e=>setCustomer(e.target.value)} placeholder="cus_…"/></label><label>Checkout Session ID (optional)<input value={checkout} onChange={e=>setCheckout(e.target.value)} placeholder="cs_…"/></label></>} onClose={()=>setOpen(false)} onDone={onDone}/>}</>;
}
export default function AdminBilling(){
 const {user}=useAuth(),{data,error,loading,reload}=useAdminData('/billing'),[action,setAction]=useState(null),[result,setResult]=useState(null),[q,setQ]=useState(''),[users,setUsers]=useState([]),[selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[failure,setFailure]=useState(''),[amount,setAmount]=useState(5);
 const privileged=user?.role==='SUPER_ADMIN';
 async function search(e){e.preventDefault();setFailure('');try{setUsers((await adminApi('/billing/users?q='+encodeURIComponent(q))).items);}catch(e){setFailure(e.message);}}
 async function inspect(u){setSelected(u);setDetail(null);setFailure('');try{setDetail(await adminApi('/billing/users/'+u.id));}catch(e){setFailure(e.message);}}
 function done(value){setResult(value);reload();if(selected)void inspect(selected);}
 return <><PageTitle title="Billing & monetization" description="Stripe subscriptions, durable trip entitlements and credit history. Financial amounts below are in minor currency units."/><LoadState loading={loading} error={error} retry={reload}/>
 {data&&<>
  <section className="admin-card"><KeyValues data={{mode:data.mode,checkout_enabled:data.enabled,enforcement_enabled:data.enforcement,stripe_configured:data.stripe_configured,webhook_configured:data.webhook_configured,api_version:data.api_version}}/><p>{data.financial_note}</p><Link to="/admin/integrations">Manage encrypted Stripe credentials</Link>{privileged&&<button className="admin-button" onClick={()=>setAction({path:'/billing/check',confirmation:'TEST',title:'Check Stripe configuration',target:data.mode,impact:'Read-only Stripe requests validate all configured prices and portal policy. This does not perform a payment.'})}>Validate Stripe configuration</button>}</section>
  <div className="admin-grid"><section className="admin-card"><h2>Subscriptions</h2><Rows items={data.subscriptions}/></section><section className="admin-card"><h2>Trip credits</h2><KeyValues data={data.credits}/></section></div>
  <section className="admin-card"><h2>Accounts</h2><KeyValues data={data.accounts}/><h2>Plans</h2><Rows items={data.catalog.plans.map(plan=>({code:plan.code,amount_minor:plan.amount,currency:plan.currency,kind:plan.kind,available:plan.available,price_id:data.prices[plan.code]||'Not configured',product_id:result?.plans?.find(p=>p.code===plan.code)?.product||'Run configuration validation'}))}/></section>
  <section className="admin-card"><h2>Purchases & refunds</h2><Rows items={data.orders}/><h2>Recent orders</h2><Rows items={data.recentOrders}/></section>
  <section className="admin-card"><h2>Recent webhook events</h2>{!data.events.length&&<p>No events received.</p>}{data.events.map(event=><div className="admin-card" key={event.event_id}><KeyValues data={event}/>{privileged&&event.status!=='processed'&&<button className="admin-button secondary" onClick={()=>setAction({path:'/billing/events/'+event.event_id+'/retry',confirmation:'RETRY',title:'Retry verified event',target:event.event_id,impact:'Fetches the original event from Stripe and reconciles current provider state. Duplicate fulfillment is prevented.'})}>Retry event</button>}</div>)}</section>
  <section className="admin-card"><h2>Feature usage</h2><Rows items={data.usage}/><h2>Google provider usage</h2><Rows items={data.providerUsage}/></section>
 </>}
 <section className="admin-card"><h2>User billing</h2><form onSubmit={search}><label>Email or user ID<input value={q} onChange={e=>setQ(e.target.value)}/></label><button className="admin-button">Search</button></form>{failure&&<p role="alert">{failure}</p>}{users.map(u=><button className="admin-button secondary" key={u.id} onClick={()=>inspect(u)}>{u.email}</button>)}</section>
 {selected&&<section className="admin-card"><h2>{selected.email}</h2>{detail?<><KeyValues data={detail.state}/><h3>Customers</h3><Rows items={detail.customers}/><h3>Subscriptions</h3><Rows items={detail.subscriptions}/><h3>Credit ledger</h3><Rows items={detail.ledger}/><h3>Trip entitlements</h3><Rows items={detail.entitlements}/></>:<p role="status">Loading…</p>}{privileged&&<button className="admin-button" onClick={()=>{setAmount(5);setAction({path:'/billing/users/'+selected.id+'/grant',confirmation:'GRANT',title:'Grant trip credits',target:selected.email,impact:'Adds non-expiring credits to the selected user in the current billing mode. Requires a reason and recent MFA.',requestKey:crypto.randomUUID()});}}>Grant credits</button>}</section>}
 {selected&&detail&&<section className="admin-card"><h2>User orders</h2><Rows items={detail.orders.map(({checkout_url,...order})=>order)}/>{privileged&&<Reconcile user={selected} onDone={done}/>}</section>}
 {result&&<section className="admin-card" role="status"><h2>Action result</h2><KeyValues data={result}/></section>}
 <StripeSetup data={data} result={result}/><AdminSettings only="billing_" title="Billing policies"/><AdminSettings only="stripe_" title="Stripe prices and portal"/>
 {action&&<ActionDialog title={action.title} target={action.target} impact={action.impact} path={action.path} confirmation={action.confirmation} extra={action.requestKey?{amount,request_key:action.requestKey}:{}} fields={action.requestKey?<label>Credits<input type="number" min="1" max="1000" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label>:null} onClose={()=>setAction(null)} onDone={done}/>}
 </>;
}
