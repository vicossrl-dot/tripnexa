# Billing implementation map — 1 October 2026

Baseline: HEAD `34f830115b50e2712b5ba77371e17e647be36ab0`; 72 unit/HTTP tests and build pass. Existing untracked `deploy-prod.sh` and `rollback-prod.sh` belong to the operator and will not be overwritten or executed. No current server billing implementation; only frontend Stripe packages exist.

This is the initial audit/map retained for review. Implemented behavior and setup: [BILLING_SETUP.md](BILLING_SETUP.md). Deployment/rollback: [BILLING_DEPLOYMENT.md](BILLING_DEPLOYMENT.md). Final local verification and remaining external gates: [BILLING_REPORT.md](BILLING_REPORT.md). The frontend was consolidated into `src/components/billing/Billing.jsx` and the existing API client instead of the separately planned page/provider files below; Home was not changed.

## Integration map

1. Billing/payment: new provider boundary with Stripe-hosted Checkout, portal, signed webhooks; no direct PayPal integration.
2. Migration: `server/migrate.js` runs repeat-safe additive modules. Add `server/billing/migrate.js`; retain all existing data and initialize legacy entitlements once.
3. Authentication: `server/auth.js`, users/sessions, owner checks and privileged MFA remain authoritative. No plan field injected into the user DTO.
4. Trip creation: `server/entities.js` central `insertRecord`, including bulk/import paths. Consume creation allowance in the same transaction as insertion, with user-row locking. Deleting trips never restores usage.
5. PDF: `server/trips.js` existing `/api/trips/:id/itinerary/pdf`; add an entitlement boundary without changing the renderer.
6. Wallet: `server/uploads.js`, `server/wallet.js`, generic Trip/TripItem file fields. Enforce limits for both uploads and final attachment associations under a trip lock; preserve lifecycle and read access.
7. AI: `server/ai.js`, generation/edit routes in `server/trips.js`, Smart Repair routes in `server/trip-health.js`. Central operation reservations/counters; manual editing and health diagnostics remain free.
8. Admin: mount a billing router under existing `requireAdmin`; sensitive configuration/grants require SUPER_ADMIN + recent MFA and audit.
9. Secrets/settings: reuse `managed_secrets`, AES-GCM context binding, `app_settings` versioning and env fallbacks.
10. Tests: retain existing node:test unit/HTTP and separate MySQL integration suites; add billing unit, concurrency/webhook integration and Chrome paywall tests. MariaDB 10.6 and external staging/payment evidence must be identified separately.

## Planned file changes

Existing backend: `server/{app,migrate,entities,uploads,wallet,trips,ai,trip-health}.js`, `server/admin/{settings,providers,router}.js`; narrower hooks may also be needed for route/map telemetry. Existing frontend: `src/{App.jsx,api/client.js,pages/Profile.jsx,pages/Home.jsx,pages/Admin.jsx}`, `src/components/admin/AdminLayout.jsx`, upload callers for explicit trip scope. Metadata: `package.json`, `package-lock.json`, `.env.example`.

New backend: `server/billing/{catalog,migrate,configuration,entitlements,usage,stripe,checkout,webhooks,router,admin}.js`. New frontend: `src/api/billing.js`, `src/components/billing/{PremiumFeatureModal,BillingProvider,PlanBilling}.jsx`, `src/pages/Pricing.jsx`, `src/pages/BillingResult.jsx`, `src/components/admin/AdminBilling.jsx`. Tests/tooling: billing unit/integration tests, browser verification and safe preflight tooling. Documentation: architecture/setup, staging/rollback, final acceptance report.

Additive tables: billing migration markers, customer mappings, orders, subscriptions/period usage, event inbox, credit ledger/lots, lifetime creation records, durable trip entitlements, operation reservations, upload associations. Store integer minor-unit amounts. No destructive rollback SQL.

## Decisions

- Default both Checkout and enforcement OFF; test mode default. Never fabricate successful payments without Stripe verification.
- One free lifetime trip; deletion does not reset it. Subscription allowance precedes packs. Subscription-created trips remain premium; an existing free trip gets temporary premium access while Pro is active, without consuming a new-trip credit.
- Annual means 20 trips per annual Stripe period. Use subscription-item periods. Initial free AI modifications: centrally configurable 3; wallet 4 free/100 premium subject to existing technical quotas.
- Fixed configurable past-due grace, anchored once to first delinquency; repeated webhooks cannot extend it. No automatic refund requests or revocation of consumed premium trips. Refund unused pack credits conservatively with an audited ledger.
- Original signed event is verified before processing; reconciliation reads current Stripe objects. Durable event uniqueness and serialized per-user fulfillment protect out-of-order/concurrent retries.
- Existing price definitions: USD 999 monthly, 7999 annual, packs 1499/2499/3999 for 5/10/20. Browser supplies internal plan code only.
- Before applying to any non-test database: backup/schema/row-count preflight and validated staging. No production migration or deployment is authorized by local test completion.
