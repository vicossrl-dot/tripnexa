# Public itineraries: maintenance and local review

Implemented locally on 6 October 2026. Read the [24-point delivery report](PUBLIC_ITINERARIES_REPORT.md) for scope, evidence and limitations. Nothing was deployed, committed or pushed.

## Architecture and privacy boundary

Private planner writes invalidate a separate public snapshot in the same transaction and enqueue a refresh. The existing Node server drains up to 20 jobs every 10 seconds. Publication reads the current private trip internally, evaluates existing Trip Health readiness, and passes it through a strict allowlist. Rendering, discovery, metadata and copying consume only the sanitized snapshot. A minimal source join checks ongoing consent and account eligibility; it never supplies page content.

`server/public-itineraries/catalog.js` is the reviewed public destination/POI registry. Unknown destinations or visit names fail closed. It currently covers the 15 editorial destinations; this intentionally limits automatic community publication. Extend the registry through review of official destination/attraction sources, with original short descriptions, public areas and realistic suggested visit lengths. Do not insert provider/user free text into it automatically. Restaurant identities are currently generalized to breakfast, lunch or dinner. No private content is sent to AI.

New trips opt in by default; old database rows remain NULL and opt out. Existing accounts and social sign-ups need source approval in Admin. New verified email registrations can qualify, subject to role/status/test checks. Approval never overrides consent, readiness or sanitization. Admin may approve an account from one of its queued snapshot records after a trip update; there is no automatic historical backfill.

The publication transaction serializes deduplication using one MySQL lock row. Public reads do not take that lock. This is deliberately conservative and appropriate for the initial volume; benchmark and partition the publication lock by destination before high-volume scaling. Discovery uses bounded pages and parameterized filters; facet limits are 1,000 cities, 250 countries, 14 durations and 20 values for each classification. Sitemaps contain up to 5,000 URLs per shard. Collections remain noindex pending an editorial review policy.

## Migrations and seeds

The normal `server/migrate.js` calls the additive, idempotent `server/public-itineraries/migrate.js`. It adds two columns and four tables. No destructive migration or existing-trip opt-in is performed. `npm.cmd run public:seed` creates or updates 15 editorial examples with stable seed keys through the same sanitizer/publication path; unchanged content keeps its timestamp. `npm.cmd run public:refresh` processes up to 100 pending jobs. Failed jobs stop retrying after five failures; a later meaningful source update resets/requeues the work. Inspect `public_itinerary_jobs.reason` and the Admin eligibility reason before retrying.

For an approved future release, use the ordinary application migration process after reviewing all pending application migrations, then seed, build and restart the existing Node process. This feature was migrated and seeded **only in `tripsync_test`** during this task. The ordinary application database, staging and production were not migrated. Website publishing alone cannot activate the API or public pages.

## Local review using the isolated test database

Use Node 22 for the application and Node >=22.19 for the website. Do not run database suites concurrently with this review server. Stop an existing process on the chosen port before starting another one; do not terminate unrelated processes.

Application terminal:

```powershell
cd C:\travel
$env:PATH='C:\travel\.local\node22\node-v22.23.3-win-x64;'+$env:PATH
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run db:start
npm.cmd run build
node scripts/public-preview.mjs
```

This helper refuses a database name without `_test`, runs the project migration and idempotent seeds there, disables SMTP delivery, and serves the built app at `http://127.0.0.1:3005`. It does not run the background publication timer. Use the CLI refresh command against the same explicitly selected test database when reviewing automatic publication.

Website terminal (port 4321 must be free):

```powershell
cd C:\travel\website
$env:PUBLIC_APP_API_ORIGIN='http://127.0.0.1:3005'
npm.cmd run dev
```

Open `http://127.0.0.1:4321/trip-examples/` and `http://127.0.0.1:3005/trips/rome/4-day-itinerary`. Local catalog cards use the local API origin for their links. Canonicals remain the intended HTTPS production URLs. Store badges remain inactive as requested. Ordinary marketing login/signup buttons still point at the production app; enter the local app through a local public itinerary's Customize CTA to review the local authentication flow.

Before creating the production website output, clear the local override:

```powershell
Remove-Item Env:PUBLIC_APP_API_ORIGIN -ErrorAction SilentlyContinue
npm.cmd run build
```

The delivered `website/dist` uses the production API origin. No secrets belong in `PUBLIC_*` variables.

## Stripe payment-method readout

`GET /api/public/payment-methods` reads the default active Stripe Payment Method Configuration in the configured test/live mode through the existing server SDK. A method is advertised only when `available=true` and effective `display_preference.value=on`. Results are restricted to known names; credentials/configuration IDs are never returned. Cache: five minutes for success, 30 seconds for unavailable results. Billing disabled returns an unverified empty list.

Local billing was disabled and no usable mode credential was available for a real account read. Thus no real enabled-method list is claimed. Once existing Stripe configuration is available, the readout updates automatically without a website rebuild. Keep the neutral checkout message when unverified. Badge symbols are local generic payment icons, not official payment-company logo assets. Actual Checkout still determines availability by country, currency, device and purchase type. No Checkout, subscription, pack, entitlement or payment setting was changed.

Reference: [Stripe Payment Method Configuration object](https://docs.stripe.com/api/payment_method_configurations/object).

## Checks and artifacts

From the application with `MYSQL_TEST_DATABASE=tripsync_test`: run `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd test`, `npm.cmd run test:integration`, `npm.cmd run test:billing`, `npm.cmd run test:public`, `node --test server/tests/storage-integration.mjs`, and `npm.cmd run build`. Run MySQL suites sequentially. Logs are in `.local/public-seo/`.

From the website: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd test`. With both local servers running, `PUBLIC_QA_APP_URL=http://127.0.0.1:3005` enables the browser suite's local public-API proxy. Run `node scripts/public-browser-qa.mjs` with the test database variable for the end-to-end public flow. This creates and removes isolated fixture users/copies and local development verification emails. Existing application regression: `node scripts/final-verification.mjs --local` from the root.

Lighthouse: build the website temporarily with the local API override, run the production preview, then `npm.cmd run test:performance` with `PUBLIC_QA_APP_URL`. It audits Home, Pricing, Trip Examples and Rome on mobile/desktop. `LIGHTHOUSE_OUTPUT` selects the artifact directory; `LIGHTHOUSE_TARGETS=home,trip-examples` can rerun affected pages. Restore the production build afterward. Local audits are not production Core Web Vitals or a live provider validation.

## Future release review

Review the report before authorizing a release. Confirm the actual hosting roots and reverse-proxy behavior: `/trips/*`, `/customize/*`, `/api/public/*`, `/public-itinerary-assets/*`, `/robots.txt` and `/sitemap*.xml` must reach Node before the SPA fallback. Keep private routes and authentication protections intact. Never cache public page/catalog/sitemap responses past consent withdrawal; they intentionally use `no-store`. Static public assets can be cached separately.

Verify real Stripe read permissions, legal text/identity/contact details, brand exports and production provider availability. Smoke-test both domains after an independently approved release. Rollback can revert application/website source and disable existing public sharing; retain additive tables for recovery rather than destroying data. The feature flag is shared with the existing public-sharing capability, so changing it also affects that capability.
