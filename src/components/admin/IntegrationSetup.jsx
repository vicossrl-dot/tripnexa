import {useState} from 'react';
import {Link} from 'react-router-dom';
import {BookOpen, CheckCircle2, CircleHelp, Copy, ShieldCheck} from 'lucide-react';

const events=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_succeeded','invoice.payment_failed','invoice.payment_action_required','charge.refunded','refund.updated','refund.created'];
function Field({name}) {
 const [message,setMessage]=useState('');
 return <span className="setup-field"><code>{name}</code><button type="button" className="admin-button secondary" aria-label={'Copy '+name} onClick={async()=>{try{await navigator.clipboard.writeText(name);setMessage('Copied');}catch{setMessage('Select and copy the field name manually.');}}}><Copy size={13}/></button><span role="status">{message}</span></span>;
}
function Checklist({items}) {return <ul className="setup-checklist">{items.map(([label,ok,note])=><li key={label}>{ok?<CheckCircle2 size={16}/>:<CircleHelp size={16}/>}<span><strong>{label}</strong> — {note}</span></li>)}</ul>;}
function Security(){return <p className="setup-security"><ShieldCheck size={18}/>Never put Stripe secret keys, webhook signing secrets or Bunny passwords in frontend code, public variables or chat. Use protected server environment variables or Admin encrypted credentials (stored on the server). Admin editing requires the existing server-only ADMIN_SECRETS_MASTER_KEY. Saved Admin values override environment defaults.</p>;}
export function BunnySetup({data}) {return <section className="admin-card integration-setup">
 <h2><BookOpen size={20}/>Bunny.net Setup · Storage & CDN</h2><p><Link to="/admin/billing">Stripe payment setup</Link></p>
 <ol>
 <li><h3>Create a private Storage Zone</h3><p>In Bunny Dashboard → Storage, create a dedicated zone for private TripNexa files. Copy its name, primary region and Storage Zone password from FTP & API Access. Use the zone password, not your Bunny account API key.</p></li>
 <li><h3>Keep public media separate</h3><p>Do not connect a public Pull Zone to the private zone. Avatars, reservation files, Wallet attachments and stored generated images use authenticated server downloads. Public marketing video/media may use a separate Pull Zone and public zone. Google Places photos are not archived in Bunny.</p></li>
 <li><h3>Enter configuration in this page</h3><div className="admin-table-wrap"><table><thead><tr><th>Admin field / server alternative</th><th>Where to find the value</th></tr></thead><tbody>
 {[
 ['storage_provider','STORAGE_PROVIDER','Choose bunny only after a successful connection test; local needs no Bunny credentials.'],
 ['bunny_storage_zone','BUNNY_STORAGE_ZONE','The exact Storage Zone name from Bunny → Storage.'],
 ['bunny_storage_region','BUNNY_STORAGE_REGION','The primary region of that zone. Choose DE, NY, LA, SG, SYD, UK, SE, BR or JH to match it.'],
 ['bunny_public_cdn_base','BUNNY_PUBLIC_CDN_BASE','Optional HTTPS base URL from a separate public Pull Zone. This setting describes public marketing media; it does not publish private files or rewrite the hero video URL.'],
 ].map(([name,env,source])=><tr key={name}><td><Field name={name}/><small>Server alternative: <code>{env}</code></small></td><td>{source}</td></tr>)}
 <tr><td><Field name="BUNNY_STORAGE_PASSWORD"/></td><td>Zone → FTP & API Access → password. Enter in Encrypted credentials on this page, or the same server environment variable.</td></tr>
 </tbody></table></div><p>Settings appear below under Storage provider and Bunny configuration; labels replace underscores with spaces. Changes require SUPER_ADMIN and recent MFA.</p></li>
 <li><h3>Test configuration</h3><p>Use Test Connection on this page, enter a reason and confirm TEST. It uploads a tiny temporary object, reads it back and deletes it. After success select bunny as storage_provider, then upload a small profile image and a Wallet file. Refresh and sign in again to verify private access and persistence. Existing local files remain readable. Do not change a zone containing existing files without the migration procedure.</p><p>The target database must have the existing storage and billing migrations applied. A valid Bunny password cannot fix missing tables or columns.</p></li>
 </ol><h3>Configuration checklist</h3><Checklist items={[
 ['Storage selected',data?.provider==='bunny',data?`Current provider: ${data.provider}`:'Status unavailable'],
 ['Zone and credentials configured',!!data?.configured,data?.configured?'Present; connection test still required':'Missing or status unavailable'],
 ['Public CDN',false,data?.publicCdn?'URL present; delivery not verified (optional)':'Optional; not required for private files'],
 ['Temporary upload test',data?.lastTest?.result==='success',data?.lastTest?`${data.lastTest.result} · ${data.lastTest.created_at}`:'Not verified for current saved configuration'],
 ['Profile / Wallet upload',false,'Manual end-to-end check required; no persistent verification status is available'],
 ]}/><Security/><p><a href="https://bunny.net/faq/" target="_blank" rel="noreferrer">Bunny storage documentation</a></p>
 </section>;}

export function StripeSetup({data,result}) {return <section className="admin-card integration-setup">
 <h2><BookOpen size={20}/>Stripe Setup · Payments</h2><p><Link to="/admin/storage">Bunny storage setup</Link></p>
 <ol>
 <li><h3>Start in a Stripe sandbox / test mode</h3><p>Create your Stripe account, then select a sandbox/test environment. TripNexa uses hosted Checkout and Customer Portal. Keep all prices, keys and webhooks in the same mode. In Billing policies below set billing_provider to stripe, billing_mode to test and leave billing_enabled and billing_enforcement_enabled false during configuration. Their server defaults are BILLING_PROVIDER, BILLING_MODE, BILLING_ENABLED and BILLING_ENFORCEMENT_ENABLED.</p></li>
 <li><h3>Create products and prices</h3><p>In Stripe → Product catalogue create the following USD prices, quantity one. Copy each price_… ID (not the prod_… product ID) into the matching field under Stripe prices and portal below. Product IDs are discovered during validation.</p>
 <div className="admin-table-wrap"><table><thead><tr><th>Product / price</th><th>Admin field</th><th>Server alternative</th></tr></thead><tbody>{[
 ['Pro monthly · $9.99 / month','pro_monthly'],['Pro annual · $79.99 / year','pro_annual'],['5 trip credits · $14.99 once','trip_pack_5'],['10 trip credits · $24.99 once','trip_pack_10'],['20 trip credits · $39.99 once','trip_pack_20'],
 ].map(([label,code])=><tr key={code}><td>{label}</td><td><Field name={'stripe_price_'+code}/></td><td><code>{'STRIPE_PRICE_'+code.toUpperCase()}</code></td></tr>)}</tbody></table></div><p>Subscriptions must use licensed monthly/yearly recurring prices; packs use one-time prices. Free requires no Stripe price.</p></li>
 <li><h3>Store the API key</h3><p>From Stripe Dashboard → Developers / API keys, copy the secret key for the selected mode. Enter <Field name="STRIPE_SECRET_KEY"/> in <Link to="/admin/integrations">Admin → AI & Integrations → Encrypted credentials</Link> or the same server environment variable. STRIPE_PUBLISHABLE_KEY is optional/reserved: this hosted Checkout frontend does not require it. A publishable key is browser-safe; secret and signing keys are not.</p></li>
 <li><h3>Configure Customer Portal</h3><p>In Stripe → Settings → Billing → Customer portal, enable invoice history and payment-method updates, permit cancellation at period end, and disable subscription price/quantity changes. Copy the bpc_… configuration ID into <Field name="stripe_portal_configuration"/> below. This field is Admin-only; there is no environment-variable fallback.</p></li>
 <li><h3>Create the webhook in Stripe</h3><p>Open Stripe Workbench → Webhooks → Create an event destination → Your account → Webhook endpoint. Use snapshot events, API version <code>{data?.api_version||'2026-08-26.dahlia'}</code>, and your public application HTTPS origin followed by <Field name="/api/billing/webhook"/>. For an installation at https://my.tripnexa.app, the complete endpoint is https://my.tripnexa.app/api/billing/webhook. Confirm your actual domain in Admin → Domains; localhost is not a public webhook address.</p><p>Select all these events, which the backend handles:</p><ul>{events.map(event=><li key={event}><Field name={event}/></li>)}</ul><p>Reveal the destination’s Signing secret (whsec_…) and enter <Field name="STRIPE_WEBHOOK_SECRET"/> in Admin → AI & Integrations → Encrypted credentials or the same server environment variable. A Stripe CLI signing secret is separate from the deployed endpoint’s secret.</p></li>
 <li><h3>Validate, then test a payment</h3><p>Use Validate Stripe configuration above with recent MFA, reason and TEST confirmation. All five prices and portal policy must pass. This makes read-only API requests; it does not prove payment or webhook delivery. Enable billing_enabled in test mode, complete a test Checkout for each plan/pack, and confirm successful delivery in Stripe and processed events under Recent webhook events here. Verify the resulting subscription/credits and Portal. Test failure, cancellation, renewal and refund paths before enabling enforcement.</p><p>Leave billing_automatic_tax and billing_paypal_enabled off until separately configured and tested in Stripe. Before going live, replace test keys, all five prices, portal ID and webhook secret with live-mode values, validate again and verify the application URL. Do not enable production purchases based solely on fixture tests.</p></li>
 </ol><h3>Configuration checklist</h3><p>Presence is not validation. Validation results below belong to the last explicit check in this page session; rerun after changing settings.</p><Checklist items={[
 ['API secret',!!data?.stripe_configured,data?.stripe_configured?'Configured; mode/permissions verified by explicit validation':'Missing or status unavailable'],
 ['Price IDs',!!data&&Object.values(data.prices).length===5&&Object.values(data.prices).every(Boolean),data?'See the five plan fields above':'Status unavailable'],
 ['Products and prices verified',result?.plans?.length===5&&result.plans.every(plan=>plan.valid),result?.plans?'Last validation result; inspect action details':'Run Validate Stripe configuration'],
 ['Portal verified',result?.portal===true,result?.portal===true?'Last validation passed':'Not verified / last validation did not pass'],
 ['Webhook secret',!!data?.webhook_configured,data?.webhook_configured?'Configured; delivery still needs testing':'Missing or status unavailable'],
 ['Webhook delivery',false,'Verify endpoint and delivery in Stripe; stored events alone do not certify the current endpoint'],
 ['Test payment',false,'Manual verification required; configuration validation never performs a payment'],
 ]}/><Security/><p><a href="https://docs.stripe.com/webhooks" target="_blank" rel="noreferrer">Stripe webhook setup reference</a></p>
 </section>;}
