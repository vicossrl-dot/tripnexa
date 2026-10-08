# TripNexa billing: architecture and Stripe setup

Status: local implementation with synthetic Stripe tests. Live/test-account Checkout, PayPal, Portal and remote staging require the external steps below. Do not enable production billing on the strength of local fixtures.

## Product rules

| Code | Price, USD | Allowance |
|---|---:|---|
| FREE | 0 | One lifetime trip creation; deletion never resets it |
| PRO_MONTHLY | 9.99 / month | 20 new premium trips per Stripe monthly period |
| PRO_ANNUAL | 79.99 / year | 20 new premium trips per Stripe annual period |
| TRIP_PACK_5 | 14.99 once | 5 non-expiring trip credits |
| TRIP_PACK_10 | 24.99 once | 10 non-expiring trip credits |
| TRIP_PACK_20 | 39.99 once | 20 non-expiring trip credits |

`server/billing/catalog.js` is the canonical product catalog. The frontend reads it through `/api/billing/plans`; it cannot send an amount, currency, quantity or Stripe Price ID. Configured Stripe prices must match the catalog exactly, including mode, recurrence and amount.

Trip creation consumes the current subscription period first, then a pack/grant lot. It uses one transaction and locks the user before inserting the trip, including imports and bulk creation. Premium creation also uses up the one lifetime free creation, preventing an extra free trip after exhausting a paid allowance. Deletion never refunds consumption. The ledger and entitlement records intentionally have no foreign key to the trip being deleted.

Subscription-created trips, credit-activated trips and legacy trips retain premium access after cancellation. An existing free trip gets temporary access while Pro is active without using one of the 20 new-trip slots. Activating that free trip permanently with a pack requires an explicit click. Credits do not expire. Test and live entitlements are isolated; legacy/free records use the shared mode.

Free trips allow four distinct private document uploads, one successful/reserved full AI generation and three AI modifications by default. Premium Wallet defaults to 100 files; existing storage and provider rate limits still apply. PDF, document extraction, Smart Repair and advanced AI are gated on the server. Manual planning/editing, online itineraries, maps, routes, basic Trip Health, public sharing and affiliate ticket links remain free.

Wallet limits cover both uploads and final associations, including generic entity and planning endpoints. Uploads receive `X-Trip-ID`; temporary scopes reserve capacity so concurrent unattached uploads cannot bypass the limit. Scoped document uploads use existing Wallet cleanup, which removes unreferenced files after 24 hours. Removing an attached file still follows the existing reference-aware cleanup.

AI operations reserve usage before calling providers. Failed work releases the reservation; successful work counts. If the process dies or completion accounting fails after work, the reservation remains counted conservatively. Do not clear such reservations without confirming the result; there is no automatic refund for ambiguous work.

`active`/`trialing` access ends at the actual item period boundary. Cancellation at period end does not cut access early. `past_due` grace defaults to three days from the first observed delinquency; `unpaid` defaults to zero. Repeated events do not move that anchor. Incomplete/expired/canceled subscriptions do not grant new Pro access. Paid-trip entitlements remain independent.

## Persistence and integration

Thirteen additive tables are created by `server/billing/migrate.js`, called from the existing migration runner:

`billing_migrations`, `billing_customer_intents`, `billing_customers`, `billing_orders`, `billing_subscriptions`, `billing_period_usage`, `billing_events`, `billing_credit_lots`, `billing_credit_ledger`, `billing_trip_entitlements`, `billing_free_allowances`, `billing_operations`, `billing_upload_scopes`.

The one-time `legacy_v1` marker grants existing trips durable legacy access and marks their owners' lifetime free creation used. Repeating migration does not promote later free trips. No existing table is dropped or rewritten. Migration uses transactional initialization after additive DDL; DDL itself is not transactionally reversible on MySQL/MariaDB.

Checkout and customer intents are committed before external creation; stable idempotency keys and per-user locks prevent duplicate sessions/customers. Ambiguous creation is never blindly retried beyond 23 hours, inside Stripe's documented minimum 24-hour retention. SUPER_ADMIN can reconcile provider IDs from Stripe Dashboard through Billing → User → Reconcile; provider metadata, mode and existing order must match. This never manually fabricates payment success.

The raw-body webhook route is registered before JSON parsing and application CSRF checks. Only this Stripe endpoint has that exception. Stripe signatures authenticate original bytes. Event IDs have a unique mode/event constraint; fulfillment and credit changes are transactional. Current subscriptions, sessions, invoices and charges are retrieved to converge after reordered events. Failure leaves a retryable inbox record. Webhooks continue when purchases/enforcement are disabled.

Pack refunds are observed, never initiated automatically. Full refunds remove remaining unused credits. Partial refunds remove the floor of the proportional credit amount, capped by remaining credits and previous removals. Consumed trips are never revoked and balances cannot become negative. A refund that precedes checkout fulfillment is rechecked from the current charge before credits commit. Subscription invoice/refund accounting remains authoritative in Stripe; internal monetary totals are explicitly checkout totals, not complete recurring revenue or MRR/ARR.

## External Stripe setup

1. Activate the business account and use a Stripe sandbox/test mode for staging. Supply keys through Admin → Integrations → encrypted credentials, or the server environment. Do not send keys in chat or put them in source.
2. Set `BILLING_MODE=test`, `BILLING_ENABLED=false`, `BILLING_ENFORCEMENT_ENABLED=false`, `BILLING_PROVIDER=stripe`. Managed settings override environment defaults. `ADMIN_SECRETS_MASTER_KEY` must already be configured to edit encrypted credentials.
3. Create the five products/prices above. Use USD, quantity one, licensed recurring monthly/annual pricing and one-time pack prices. Set the five `STRIPE_PRICE_*` env values or the equivalent `stripe_price_*` Admin settings. There is no client-supplied price or arbitrary pricing override.
4. Store `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` securely. `STRIPE_PUBLISHABLE_KEY` is optional/reserved: hosted Checkout does not require it in this frontend. No Stripe secret is returned to React.
5. Configure the Billing Portal: invoice history ON, payment method updates ON, subscription cancellation **at period end**, subscription price/quantity changes OFF. Save its `bpc_…` ID in Admin → Billing → Stripe portal configuration. Unsupported portal policies fail closed.
6. Register `https://staging.tripnexa.app/api/billing/webhook` in the same Stripe test account. Configure the API version expected by the pinned SDK: `2026-08-26.dahlia` (`stripe@22.6.2`). Subscribe to the events below. Copy that endpoint's own signing secret into staging secret storage.
7. Verify the application URL in Admin → Domains. Checkout return paths are `/billing/success?order=…` and `/billing/cancel?order=…`; the Portal returns to `/billing`. They derive from the managed application URL. A browser redirect alone never grants access.
8. Run Admin → Billing → Validate Stripe configuration with recent MFA. Review all five prices, product IDs and portal policy. This is a read-only API check, **not** a payment test.
9. Enable purchases in test mode, then test every price using Stripe's documented test facilities. Exercise success, failure, asynchronous payment, duplicate submit, cancellation, renewal/test clock, delayed/reordered webhook, partial/full refund, and Portal invoice/payment-method access. Enable enforcement on staging and repeat the feature matrix.
10. Keep automatic tax disabled until the account's tax registrations and product tax behavior are configured. Only then enable `billing_automatic_tax`. Stripe, not React, determines tax.
11. Production uses separate live prices, keys and endpoint signing secret at `https://my.tripnexa.app/api/billing/webhook`. Enable only after staging and explicit deployment approval.

Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`, `charge.refunded`, `refund.created`, `refund.updated`.

PayPal is processed **through Stripe**. Enable it in Stripe's payment-method settings and verify business-country eligibility and recurring-payment approval before turning on `billing_paypal_enabled`. Card remains the default. No direct PayPal credentials or integration are used. Account eligibility has not been checked. See [Stripe PayPal](https://docs.stripe.com/payments/paypal), [recurring approval](https://docs.stripe.com/payments/paypal/set-up-future-payments), [webhook signatures](https://docs.stripe.com/webhooks/signature) and [idempotency](https://docs.stripe.com/api/idempotent_requests).

## API and operations

Public: `GET /api/billing/plans`.

Authenticated: `GET /api/billing/status`, `/orders`, `/orders/:id`, `/trips/:id`; `POST /api/billing/checkout`, `/portal`, `/orders/:id/cancel`, `/trips/:id/activate`. Normal users receive internal order IDs and safe DTOs, not Stripe customer/subscription IDs. Ownership remains mandatory for every trip endpoint, including administrators.

Stripe: `POST /api/billing/webhook` (signature required).

Admin: `GET /api/admin/billing`, `/billing/users?q=…`, `/billing/users/:id`; privileged `POST /billing/check`, `/billing/users/:id/grant`, `/billing/users/:id/reconcile`, `/billing/events/:id/retry`. Grants, reconciliation and retries require SUPER_ADMIN, recent MFA, a reason and exact confirmation, with audit records. Existing versioned settings and encrypted secret APIs manage configuration.

UI: `/pricing`, `/billing`, `/billing/success`, `/billing/cancel`, Profile → Plan & Billing, `/admin/billing`, reusable paywall for stable HTTP 402 machine codes. Checkout buttons are disabled when purchasing is unavailable. Admin reports labeled internal totals, status groups, free/Pro accounts, credits, orders, entitlements, provider/feature usage and failed/retryable events. Product IDs appear after explicit configuration validation. Complete invoices and financial reconciliation use Stripe Portal/Dashboard.

The enforcement kill switch removes premium restrictions without deleting billing data. New trips created while enforcement is off receive durable legacy access; this intentionally avoids retroactively locking launch/rollback trips. Turning off purchases alone does not cancel subscriptions. Disabling either switch does not stop webhooks.
