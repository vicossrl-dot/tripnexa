# Before You Go: persistent cost protection — 7 October 2026

Local implementation only. No deployment, production data/configuration writes, migration, live provider requests or backend restart. Guide content, prompts, verification, entitlement/billing checks and PDF renderers remain unchanged.

## Storage and limits

Existing `usage_counters` accounting is reused. Its ordinary daily/minute buckets cannot represent a rolling window, and best-effort provider telemetry is not an atomic admission check. Essentials therefore uses timestamped attempt buckets in that same table, scoped to the authenticated account, with a hashed trip operation. A separate zero-count account row is locked transactionally before checking both limits and inserting an attempt. MySQL time is authoritative; browser values cannot change admission.

Defaults are **two attempts per trip per rolling 24 hours** and **twenty attempts per account across trips per rolling 24 hours**. Backend configuration:

```dotenv
ESSENTIALS_MAX_UPDATES_PER_TRIP_24H=2
ESSENTIALS_MAX_UPDATES_PER_USER_24H=20
```

Absent, malformed, zero, negative or excessive values use the defaults. Accepted integer ranges are 1–100 per trip and 1–1000 per account. Values are loaded from the server environment only. No new table or **DB migration** is required; the existing InnoDB `usage_counters` table must already be present.

Account locking plus a current `FOR UPDATE` counter read enforces both ceilings across backend restarts, Passenger recycling and workers sharing the same MySQL database. Initial independent-worker validation exposed a stale consistent read under MySQL REPEATABLE READ; the reservation now explicitly uses a current read after acquiring the account lock. This fixed both trip and account concurrency checks. Expired Essentials attempt rows are pruned on a subsequent reservation; snapshot records and other operation counters are never pruned by this feature.

## What counts

The existing provider wrapper has an optional Essentials-only pre-fetch hook. After ordinary provider quota checks, it reserves a durable attempt immediately before starting the primary fetch. Each started fetch consumes one attempt, including HTTP/network failures and timeouts. Completed, failed or timed-out requests are not refunded. In-process same-context coalescing shares one fetch and one attempt. Requests blocked by the Essentials limits make zero provider fetches and reserve zero attempts.

Opening/reopening, cached context reuse, clearing the passport, standalone PDF and Full Travel Book make zero generation attempts. An unconfigured provider makes none. A known cancellation between reservation and fetch cancels its reservation. A process crash in that narrow interval conservatively retains the reservation, because a restart cannot establish whether upstream work began. Cross-worker duplicate requests are bounded by the same limits but are not globally coalesced into one provider call.

Unavailable accounting prevents starting the provider request. Existing generic provider quotas and telemetry remain in place; this feature neither changes trip-credit billing nor adds a new provider.

## Saved guides and passports

A current-context guide containing usable generated guidance is fresh for **24 hours**, including useful partial output. A timestamp on a minimal provider-failure fallback does not make it a successful fresh guide. Explicit updates reuse a fresh snapshot before attempting a quota reservation. Existing failure/partial retry protection remains; there is no automatic retry or background regeneration.

Old guides stay saved and readable after 24 hours. Only an explicit update can generate a replacement. The rolling attempt window is independent of passport/context hashes: Moldova → Romania can use the two allowed attempts; Panama and further new contexts are then blocked. Switching back to a fresh saved context reuses it without another attempt.

For a blocked passport with no saved guide, the panel retains the most recent same-trip practical guide and removes its passport-specific entry claims. That view is not persisted as a newly generated snapshot. The PDF action reads the original saved passport context, preserving its actual passport label through the existing endpoint. PDF renderers, saved-snapshot PDF reads and Full Travel Book are unchanged.

## UI and response

Blocked updates return the saved response with `code: ESSENTIALS_DAILY_LIMIT`, `nextAllowedAt`, and server-calculated `updates` metadata. This is a normal limit state, not an application-error alert. Saved guides remain visible. Update information is disabled until the reported expiry; Download Essentials PDF stays available when a saved guide exists.

One existing-style helper shows remaining updates or **“Daily update limit reached.”** and **“You can update this travel brief again in 14h 22m.”** The countdown advances from sampled server time using elapsed time. Expiry re-enables the button without generating anything; the server rechecks admission on the next explicit action. Passport persistence, the spinner, immediate duplicate guard, stale-response guard and modal layout remain.

## Files changed

- `server/premium-travel/essentials-limits.js`: persistent rolling admission using existing quota rows.
- `server/config.js`, `.env.example`: server-only configurable limits and safe defaults.
- `server/ai.js`: optional pre-fetch accounting hook and known pre-fetch cancellation cleanup; other callers keep their defaults.
- `server/premium-travel/essentials-provider.js`: forwards that hook and returns structured blocked status, without changing generation or verification.
- `server/premium-travel/essentials.js`: 24-hour successful-guide reuse and panel-only quota/retained-guide metadata.
- `server/premium-travel/router.js`: metadata on the existing owned premium panel GET/update routes; export handlers unchanged.
- `src/lib/essentials-updates.js`, `src/components/trip/PremiumTripFeatures.jsx`: helper/countdown, disabled update state and existing saved-context PDF action.
- `server/tests/essentials-limits-integration.mjs`: isolated MySQL/process/wrapper tests.
- `server/tests/destination-essentials.test.js`: existing explicit-update clock fixtures advanced past the new 24-hour freshness interval; provenance/safety assertions retained.
- This report. Ignored local browser fixture/artifacts are under `.local/essentials-limits/`.

## Validation

**43 targeted test results passed, zero failures/skips**: 30 Essentials/Travel Book/premium-entitlement tests, 12 MySQL limiter results (eleven behavior subtests plus their parent), and one selected existing Trip Names test for the shared provider wrapper. Targeted component ESLint and existing typecheck passed. No full suite ran.

The isolated `tripsync_test` checks exercised first/second/third attempts, fresh reuse, multiple passport changes, actual wrapper error/AbortSignal timeout, pre-fetch cancellation, shared concurrent work, independent Node workers/restart visibility, rolling expiry, retained old snapshots and both trip/account ceilings. Five independent processes admitted exactly two trip reservations; with nineteen account reservations, three workers on different trips admitted exactly one more. Snapshot reads and both PDF HTML renderers added zero attempts. Fixture users, snapshots and quota rows were cleaned up; no migration or application-database write occurred.

The actual React modal was checked with mocked API responses at **1440 / 390 px**: retained cards, disabled Update, enabled PDF, no horizontal overflow or browser errors. A blocked newly selected passport downloaded the last saved passport context. Reopening restored the selection without an update; accelerated elapsed time changed the countdown and enabled Update on expiry without an automatic POST. Screenshots were inspected. This browser check simulates responses; it is complemented by the actual MySQL/provider-wrapper integration rather than presented as a live model test. No new actual PDF rendering was needed because PDF layout/content did not change.

**One production build passed**, with only the existing Vite large-bundle advisory. Zero live AI/search/map requests or billed provider credits were consumed by validation. The provider's eventual live response quality/latency is outside this change.

Commands:

```powershell
$env:MYSQL_TEST_DATABASE='tripsync_test'
node --test server/tests/essentials-limits-integration.mjs
node --test server/tests/destination-essentials.test.js server/tests/travel-book.test.js server/tests/premium-travel-entitlements.test.js
node --test --test-name-pattern='Trip names' server/tests/phase-one.test.js
node node_modules/eslint/bin/eslint.js src/components/trip/PremiumTripFeatures.jsx --quiet
npm.cmd run typecheck
node .local/essentials-limits-browser.mjs
npm.cmd run build
```

Browser artifacts: `.local/essentials-limits/browser-report.json`, `1440.png`, `390.png`. Earlier failed concurrency validation was corrected and the affected checks rerun; the final results above describe the corrected implementation.
