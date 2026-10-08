# TripNexa monetization — local verification report

1 October 2026. **Local implementation verified; production readiness is not certified.** No commit, production deployment, production migration, real payment or modification of the real `.env` was performed. Stripe configuration and remote staging access are absent.

## A. What changed

Added server-enforced Free/Pro/Trip Pack access, lifetime free creation, actual Stripe-period allowances, durable premium trip entitlements, non-expiring transactional credits, AI usage reservations, expanded Wallet limits, hosted Checkout/Portal integration, signed/retryable webhooks, refund-safe unused-credit adjustment, user billing/pricing/paywall UI and audited billing administration. Existing auth, itinerary, affiliate, PDF and Wallet engines remain in place.

## B. Files changed

Existing files:

- `.env.example`, `package.json`, `package-lock.json`, `README.md`, `docs/ADMIN_IMPLEMENTATION.md`.
- `server/app.js`, `server/migrate.js`, `server/entities.js`, `server/uploads.js`, `server/wallet.js`, `server/trips.js`, `server/ai.js`, `server/trip-health.js`.
- `server/admin/audit.js`, `server/admin/providers.js`, `server/admin/router.js`, `server/admin/settings.js`.
- `src/App.jsx`, `src/api/client.js`, `src/pages/Admin.jsx`, `src/pages/Profile.jsx`.
- `src/components/admin/AdminLayout.jsx`; `src/components/planning/PrivateFileField.jsx`, `StepPlaces.jsx`, `StepStay.jsx`, `StepTrip.jsx`; `src/components/trip/AddItemModal.jsx`, `LinkAutoFill.jsx`.
- `server/tests/affiliate-integration.mjs`, `scripts/verify-affiliates.mjs`: corrected synthetic Klook tracking to include the `aid` and `aff_adid` already required by the existing provider. Production affiliate validation was not weakened.

New files:

- `server/billing/catalog.js`, `configuration.js`, `migrate.js`, `entitlements.js`, `usage.js`, `stripe.js`, `checkout.js`, `webhooks.js`, `router.js`, `admin.js`.
- `server/tests/billing.test.js`, `server/tests/billing-integration.mjs`.
- `src/components/billing/Billing.jsx`, `src/components/admin/AdminBilling.jsx`, `src/styles/billing.css`.
- `scripts/billing-preflight.mjs`, `scripts/verify-billing.mjs`.
- `docs/BILLING_IMPLEMENTATION.md`, `BILLING_SETUP.md`, `BILLING_DEPLOYMENT.md`, `BILLING_REPORT.md`.

The pre-existing untracked `deploy-prod.sh` and `rollback-prod.sh` remain operator-owned and unchanged. Stripe's backend SDK is pinned to 22.6.2; the lockfile contains that dependency addition. No broad dependency upgrade was made.

## C. Database migrations

Thirteen new InnoDB billing tables; no destructive alteration of existing application data. The repeat-safe `legacy_v1` transaction preserves all pre-billing trips and lifetime creation history. Full schema details are in [setup](BILLING_SETUP.md).

Applied only to `tripsync_test` and a separately initialized `billing_maria_test`. Before the MySQL test migration: schema inspected, 45 tables, zero users/trips, 532,642-byte backup saved. Exact MariaDB 10.6.21 migration and repeat migration passed. A MariaDB dump was restored into a new `billing_restore_*_test` database and aggregate user/trip/ledger counts matched. These local proofs do not replace backup/restoration testing on the hosting environment.

## D. New API endpoints

`GET /api/billing/plans`; authenticated `GET /api/billing/status`, `/orders`, `/orders/:id`, `/trips/:id`; `POST /api/billing/checkout`, `/portal`, `/orders/:id/cancel`, `/trips/:id/activate`; signature-authenticated `POST /api/billing/webhook`.

Admin: `GET /api/admin/billing`, `/billing/users`, `/billing/users/:id`; privileged `POST /billing/check`, `/billing/users/:id/grant`, `/billing/users/:id/reconcile`, `/billing/events/:id/retry`. Existing premium feature endpoints receive entitlement boundaries without changing their engine contracts.

## E. Frontend

New `/pricing`, `/billing`, `/billing/success`, `/billing/cancel`; Profile → Plan & Billing; a reusable accessible paywall reacting to stable machine codes. Plan prices come from the backend. Purchase results wait for server-confirmed status. No browser return grants credits. Scope is passed for private uploads and trip-specific advanced AI. A premium Wallet at its technical limit prompts file removal rather than promising another upgrade.

## F. Admin

Billing overview, configuration state, free/Pro account counts, subscription groups, checkout totals, recent orders/events, credit balances/history, trip entitlements, feature/provider usage, audited grants, verified provider reconciliation and webhook retry. Sensitive writes retain SUPER_ADMIN/recent-MFA/reason requirements. Existing encrypted credentials and versioned settings are reused. Financial totals are explicitly checkout totals excluding recurring invoice accounting, not invented MRR/ARR. Stripe is the complete invoice/accounting source.

## G. Stripe configuration required

Supply test secret/webhook keys through secure server configuration, create the five exact prices, configure the Portal, register the webhook events/API version, validate configuration in Admin, then exercise actual Stripe test Checkout. Detailed steps and exact prices are in [BILLING_SETUP.md](BILLING_SETUP.md). Neither environment nor managed secrets currently contains Stripe credentials.

## H. PayPal configuration required

Enable PayPal **through Stripe** for an eligible business account and confirm recurring-payment approval. Keep `billing_paypal_enabled` off until verified. No direct PayPal integration was added. Real Card/PayPal purchase, cancellation and refund tests remain external gates.

## I–J. Tests executed and results

| Check | Result |
|---|---|
| Node unit/HTTP suite | **77/77**, including all 72 original tests and 5 new billing/security tests |
| MySQL 8.4 integration, existing + billing | **54/54** |
| MariaDB **10.6.21**, same integration suites | **54/54** |
| Typecheck / ESLint | Pass |
| Node **22.23.3** `require('./server/index.js')` + graceful SIGTERM path | Pass, no async-ESM require error |
| Existing full Chrome smoke with provider fixtures | Pass: wizard autosave/reload, navigation, itinerary edits and sharing |
| Billing Chrome verification | **13 checks**, zero failures or unhandled browser exceptions |
| Existing affiliate Chrome regression | Pass, all four providers, private Wallet link and anonymous sharing |
| Existing final local journey | Pass: synthetic AI/maps/routes, actual private-file rendering and Chrome PDF export, desktop/mobile, Admin MFA |
| Actual Chrome PDF | Pass, 166,061-byte PDF in the local journey |
| MariaDB backup/restore rehearsal | Pass in isolated disposable databases |
| Secret-reference scan of changed/new source against configured secret values | No matches |
| `git diff --check` | Pass |

Billing tests include lifetime deletion protection, concurrent creation/credit consumption, no 21st Pro trip without a pack, real-period renewal, subscription-first spending, cancellation durability, owner checks, direct premium API rejection, successful/failed AI reservations, concurrent fifth-file blocking, generic-image association bypass rejection, unique customer/session retries, all three pack grants, duplicate/reordered events, refunds before/after fulfillment, persistent failed-event retry, Admin grant audit/idempotency and kill-switch preservation.

The browser uses actual built React, Express and database operations with synthetic users. PDF and fifth-file Wallet tests click/use the real UI. Additional paywall variants use machine-code responses from real endpoints. Stripe state in local integration/browser tests is synthetic; none of these results claims a real Card, PayPal or Portal payment.

Local evidence (not included in release archives): `.local/billing-verification/{report.json,mysql-tests.txt,mariadb-tests.txt,*.png}`, `.local/affiliate-verification/report.json`, `.local/final-local/report.json` and existing smoke artifacts. Screenshots include pricing desktop/mobile, PDF paywall, Wallet 4/4, Trip Packs, AI limit, free/Pro trip limit, annual cancellation, past-due state and Billing Admin.

## K. Build

Vite production build passed using Node 22.23.3. Existing large-bundle warning remains; no unrelated bundling refactor. The normally installed terminal Node is 24.21.0, so an official checksum-verified portable Node 22 runtime was used for target-version verification. Package engines remain `>=22 <23`.

## L. Staging result

**Not deployed or verified.** `https://staging.tripnexa.app` is the intended target, not a claimed successful deployment. No remote SSH/control-panel access or staging worker paths were available. The reviewed local release and the staging checklist are prepared; the actual LiteSpeed proxy, socket connectivity, Chrome installation and signed Stripe callbacks must still be exercised there.

## M. Remaining external setup

Configure the Stripe test account/prices/secrets/webhook/Portal, verify PayPal eligibility, run real test payments and test-clock renewal/delinquency, provide/configure the dedicated staging runtime/database/uploads, restore-test that environment's backup, run the staging acceptance matrix. Live mode must use its own prices/keys/webhook secret after explicit production approval.

## N. Production deployment

Do not deploy yet. Follow [BILLING_DEPLOYMENT.md](BILLING_DEPLOYMENT.md) after the staging gates pass: protected backup and restoration test, additive migration, exact reviewed archive, existing versioned-release activation, restart only the application's own worker, health/regression checks, then audited policy activation. Preserve the real shared `.env` and uploads. The existing operator scripts were not executed.

## O. Rollback

First disable purchases and enforcement while retaining webhook processing and financial/entitlement data. If a code rollback is necessary, use the existing exact runtime backup and preserve all additive tables/shared files. Reconcile missed Stripe events before resuming enforcement. Never drop the ledger or restore a pre-payment database over paid activity. The deployment document covers old-release trip reconciliation and bounded Stripe retry retention.

## P. Known limitations / readiness gates

- Real Stripe Card, PayPal, Portal, test-clock and remote staging evidence are missing. Therefore this is **not certified production-ready**.
- Recurring invoice history/accounting and subscription refund accounting are authoritative in Stripe; Admin internal totals explicitly cover recorded Checkouts. The Portal is configured to expose invoice history and payment-method recovery.
- Ambiguous remote creation beyond the idempotency window requires audited Dashboard-ID reconciliation, not an unsafe automatic retry. Ambiguous AI reservations remain counted until investigated.
- Existing `moment@2.30.1` has one moderate npm advisory, `GHSA-4p3w-j4w9-5jqw`; no Stripe SDK advisory was reported. The existing dependency was not silently upgraded in this billing change.
- Main local and production databases are untouched. This code requires its additive migration before activation in either environment; remote staging must precede a non-test rollout.
- No commits were created. Checkout/enforcement default OFF and mode defaults to TEST.
