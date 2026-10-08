import { translateText, t, getLocale } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import '@/styles/billing.css';

const money = (amount, currency = 'usd') => new Intl.NumberFormat(getLocale(), { style: 'currency', currency }).format(amount / 100);
const date = value => value ? new Date(String(value).replace(' ', 'T').replace(/Z$/, '') + 'Z').toLocaleDateString(getLocale()) : '—';
async function checkout(code) {
  const key = 'tripnexa_checkout_' + code;
  let requestKey = sessionStorage.getItem(key);
  if (!requestKey) { requestKey = crypto.randomUUID(); sessionStorage.setItem(key, requestKey); }
  let result = await api.billing('/checkout', { plan_code: code, request_key: requestKey });
  if (['canceled','failed'].includes(result.status)) {
    requestKey = crypto.randomUUID(); sessionStorage.setItem(key, requestKey);
    result = await api.billing('/checkout', { plan_code: code, request_key: requestKey });
  }
  if (result.url) window.location.assign(result.url);
  else { sessionStorage.removeItem(key); window.location.assign('/billing/success?order=' + encodeURIComponent(result.order_id)); }
}

export function PlanChoices({ packsOnly = false, subscriptionsOnly = false, onDone = () => {} }) {
  useLocale();
  const { user } = useAuth(), navigate = useNavigate();
  const [catalog, setCatalog] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const load = useCallback(() => { setError(''); api.billing('/plans').then(setCatalog).catch(e => setError(e.message)); }, []);
  useEffect(load, [load]);
  async function buy(code) {
    if (!user) { onDone(); navigate('/register'); return; }
    setBusy(code); setError('');
    try { await checkout(code); } catch (e) { setError(e.message); setBusy(''); }
  }
  return <div className="billing-content">
    {error && <p role="alert">{translateText(error)} <button onClick={load}>{t("ui.retry.942087c")}</button></p>}
    {!catalog && !error && <p role="status">{t("ui.loading.plans.f9065f6")}</p>}
    {catalog && <>
      {!catalog.enabled && <p className="billing-notice" role="status">{t("ui.purchases.are.not.available.yet.you.can.continue.using.your.saved.af5d389")}</p>}
      {catalog.enabled && catalog.mode === 'test' && <p className="billing-notice">{t("ui.test.checkout.no.live.payments.1bbd601")}</p>}
      <div className="billing-plans">{catalog.plans.filter(p => (!packsOnly || p.kind === 'payment') && (!subscriptionsOnly || p.kind === 'subscription')).map(plan => <article key={plan.code} className="billing-plan">
        <h3>{plan.name}</h3><p className="billing-price">{money(plan.amount, plan.currency)}<small>{plan.interval ? ' / ' + plan.interval : t("ui.once.c0da09c")}</small></p>
        <p>{plan.kind === 'subscription' ? t("ui.20.new.premium.trips.per.billing.value.0c74ea7", {v0: plan.interval}) : t("ui.value.premium.trip.credits.no.expiry.62cc354", {v0: plan.credits})}</p>
        <p>{plan.kind === 'subscription' ? t("ui.cancel.at.the.end.of.your.paid.period.premium.trips.you.create.st.65db715") : t("ui.one.credit.unlocks.one.new.or.existing.trip.permanently.c75ebad")}</p>
        <button className="billing-primary" disabled={!!busy || !plan.available} onClick={() => buy(plan.code)}>{busy === plan.code ? t("ui.opening.checkout.f1ec8f0") : user ? (plan.kind === 'subscription' ? t("ui.get.9d22c33") : t("ui.buy.e8c84f1")) + plan.name : t("ui.create.account.798ca2c")}</button>
      </article>)}</div>
      <p className="billing-muted">{t("ui.premium.trips.include.interactive.trip.maps.pdf.export.document.e.1884c5a")}{" "}{catalog.premium.wallet}{" "}{t("ui.wallet.files.pro.allowance.is.used.before.pack.credits.the.annual.e3ccce5")}</p>
      <p className="billing-muted">{t("ui.free.includes.one.lifetime.trip.96f3826")}{" "}{catalog.free.wallet}{" "}{t("ui.wallet.files.one.full.ai.generation.and.b0517e6")}{" "}{catalog.free.ai_modifications}{" "}{t("ui.ai.modifications.for.that.trip.manual.planning.google.maps.links.20d0726")}</p>
    </>}
  </div>;
}

export function PlanBilling() {
  useLocale();
  const [state, setState] = useState(null), [orders, setOrders] = useState([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(''); try { const [s, o] = await Promise.all([api.billing('/status'), api.billing('/orders')]); setState(s); setOrders(o.items); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function portal() { setBusy(true); setError(''); try { const result = await api.billing('/portal', {}); window.location.assign(result.url); } catch (e) { setError(e.message); setBusy(false); } }
  async function cancel(id) { setBusy(true); setError(''); try { await api.billing('/orders/' + id + '/cancel', {}); const order=orders.find(o=>o.id===id);if(order)sessionStorage.removeItem('tripnexa_checkout_'+order.plan_code); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <section className="billing-content">
    <h2>{t("ui.plan.billing.b6f72cd")}</h2>
    {error && <p role="alert">{translateText(error)} <button onClick={load}>{t("ui.retry.942087c")}</button></p>}
    {!state && !error && <p role="status">{t("ui.loading.billing.2c8af4d")}</p>}
    {state && <>
      <div className="billing-summary"><article><h3>{state.plan === 'PRO' ? t("ui.tripnexa.pro.2cafaae") : t("ui.free.f411a1f")}</h3><p>{state.subscription?.has_access ? t("ui.value.value.new.premium.trips.used.this.billing.period.da1e4b5", {v0: state.subscription.used, v1: state.subscription.limit}) : t("ui.value.1.lifetime.free.trip.used.610bf80", {v0: Math.min(state.free_used, 1)})}</p></article><article><h3>{state.credits}{" "}{t("ui.trip.credits.4700afc")}</h3><p>{t("ui.unused.credits.never.expire.e2567ad")}</p></article></div>
      {!state.enforcement && <p className="billing-notice">{t("ui.plan.limits.are.currently.paused.saved.trip.access.is.preserved.33fe65d")}</p>}
      {state.subscription && <div className="billing-notice"><p>{t("ui.subscription.ea320b3")}{" "}<strong>{state.subscription.status.replaceAll('_', ' ')}</strong></p><p>{t("ui.current.period.f24e1a7")}{" "}{date(state.subscription.period_start)} – {date(state.subscription.period_end)}</p>
        {state.subscription.cancel_at_period_end || state.subscription.cancel_at ? <p>{t("ui.cancellation.scheduled.for.045adfd")}{" "}{date(state.subscription.cancel_at || state.subscription.period_end)}{t('qa.subscription.note')}</p> : state.subscription.next_billing_date && <p>{t("ui.next.billing.date.8e6f9cf")}{" "}{date(state.subscription.next_billing_date)}</p>}
        {['past_due', 'unpaid', 'incomplete'].includes(state.subscription.status) && <p>{t("ui.please.update.your.payment.method.in.manage.billing.existing.prem.4a2c78c")}</p>}
      </div>}
      {(state.subscription || orders.some(o => o.status === 'paid' || o.status === 'refunded')) && <button disabled={busy} onClick={portal}>{t("ui.manage.billing.6d3a16f")}</button>}
      <Link className="billing-link" to="/pricing">{t("ui.compare.plans.and.buy.trip.credits.9859ff0")}</Link>
      <h3>{t("ui.purchase.history.3cbb596")}</h3>
      {!orders.length ? <p>{t("ui.no.purchases.yet.229c89d")}</p> : <div className="billing-table"><table><thead><tr><th>{t("ui.plan.fa8ed0b")}</th><th>{t("ui.status.920e413")}</th><th>{t("ui.total.c9b3c38")}</th><th>{t("ui.date.99c40ab")}</th><th>{t("ui.actions.ff8059d")}</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td>{o.plan_code.replaceAll('_', ' ')}</td><td>{o.status}</td><td>{money(o.paid_amount || o.amount, o.currency)}{o.refunded_amount > 0 && <small>{" "}{t("ui.refunded.41c638f")}{" "}{money(o.refunded_amount, o.currency)}</small>}</td><td>{date(o.created_at)}</td><td>{o.status === 'pending' && <><button disabled={busy} onClick={async () => { setBusy(true); try { await checkout(o.plan_code); } catch (e) { setError(e.message); setBusy(false); } }}>{t("ui.resume.d640c74")}</button><button disabled={busy} onClick={() => cancel(o.id)}>{t("ui.cancel.checkout.7f7659d")}</button></>}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}

export function BillingPage() {
  useLocale(); return <main className="billing-page"><Link to="/profile">{t("ui.profile.d04d515")}</Link><PlanBilling/></main>; }
export function PricingPage() {
  useLocale(); return <main className="billing-page"><Link to="/">{t("ui.my.trips.9fa37fa")}</Link><header><p className="billing-eyebrow">{t("ui.your.next.adventure.df165af")}</p><h1>{t("ui.travel.your.way.74cc6dd")}</h1><p>{t("ui.start.with.a.free.trip.choose.pro.or.trip.credits.when.you.need.m.fa375cb")}</p></header><PlanChoices/><Link to="/billing">{t("ui.view.my.plan.and.purchases.7ae9f40")}</Link></main>; }

export function BillingReturn() {
  useLocale();
  const [params] = useSearchParams(), location = useLocation(), id = params.get('order'), canceled = location.pathname.endsWith('/cancel');
  const [order, setOrder] = useState(null), [error, setError] = useState(''), [waiting, setWaiting] = useState(true);
  useEffect(() => {
    let disposed = false, timer, attempts = 0;
    async function poll() {
      try { const result = await api.billing('/orders/' + encodeURIComponent(id || '')); if (disposed) return; setOrder(result); setError(''); attempts++;
        if(result.status!=='pending')sessionStorage.removeItem('tripnexa_checkout_'+result.plan_code);
        if (result.status === 'pending' && attempts < 20 && !canceled) timer = setTimeout(poll, 3000); else setWaiting(false);
      } catch (e) { if (!disposed) { setError(e.message); setWaiting(false); } }
    }
    void poll(); return () => { disposed = true; clearTimeout(timer); };
  }, [id, canceled]);
  const paid = order?.status === 'paid';
  return <main className="billing-page"><div className="billing-content"><h1>{paid ? t("ui.your.purchase.is.confirmed.6a3b329") : canceled ? t("ui.checkout.closed.c751012") : t("ui.confirming.your.purchase.f25aa8b")}</h1>
    {error && <p role="alert">{translateText(error)}</p>}
    {paid ? <p>{t("ui.your.plan.or.trip.credits.are.ready.8b8ab37")}</p> : <p role="status">{waiting && !canceled ? t("ui.waiting.for.payment.confirmation.7442693") : order?.status === 'pending' ? t("ui.payment.is.not.confirmed.yet.you.can.check.your.purchase.history.e04b25c") : t("ui.purchase.status.value.2bf7a2b", {v0: order?.status || 'unavailable'})}</p>}
    {canceled && !paid && <p>{t("ui.you.can.resume.or.cancel.this.pending.checkout.from.plan.billing.9701eba")}</p>}
    <Link className="billing-link" to="/billing">{t("ui.plan.billing.b6f72cd")}</Link><Link className="billing-link" to="/">{t("ui.back.to.my.trips.72e7577")}</Link>
  </div></main>;
}

export function BillingPaywall() {
  useLocale();
  const [detail, setDetail] = useState(null), [packs, setPacks] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false), [credits, setCredits] = useState(0);
  useEffect(() => { const show = event => { setDetail(event.detail); setPacks(false); setError(''); setCredits(0); api.billing('/status').then(s => setCredits(s.credits)).catch(() => {}); }; window.addEventListener('billing-required', show); return () => window.removeEventListener('billing-required', show); }, []);
  async function activate() { setBusy(true); try { await api.billing('/trips/' + encodeURIComponent(detail.tripId) + '/activate', {}); setDetail(null); window.dispatchEvent(new CustomEvent('billing-unlocked')); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <Dialog open={!!detail} onOpenChange={open => { if (!open) setDetail(null); }}><DialogContent className="billing-dialog"><DialogTitle>{detail?.code === 'TRIP_LIMIT_REACHED' ? t("ui.ready.for.another.adventure.742f80f") : t("ui.get.more.from.your.trip.5665ba3")}</DialogTitle><DialogDescription>{detail?.error || t("ui.choose.pro.or.a.trip.pack.to.continue.e5c20fb")}</DialogDescription>
    {detail?.limit !== undefined && <p>{detail.used} / {detail.limit}{" "}{t("ui.used.f839161")}</p>}
    {error && <p role="alert">{translateText(error)}</p>}
    {credits > 0 && detail?.tripId && <button className="billing-primary" disabled={busy} onClick={activate}>{t("ui.use.1.trip.credit.2905e6a")}{credits}{" "}{t("ui.available.2d9c90b")}</button>}
    {detail?.premium ? <p>{t("ui.your.trip.already.has.premium.access.remove.files.you.no.longer.n.ecdb723")}</p> : <><div className="billing-actions"><button onClick={() => setPacks(false)} aria-pressed={!packs}>{t("ui.pro.plans.1f7abdd")}</button>{detail?.allowTripPack!==false&&<button onClick={() => setPacks(true)} aria-pressed={packs}>{t("ui.trip.packs.8e223b6")}</button>}</div>
    {detail && <PlanChoices packsOnly={packs} subscriptionsOnly={!packs} onDone={() => setDetail(null)}/>}</>}<button onClick={() => setDetail(null)}>{t("ui.continue.with.my.current.plan.0504548")}</button>
  </DialogContent></Dialog>;
}
