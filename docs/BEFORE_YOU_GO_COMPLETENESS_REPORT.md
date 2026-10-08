# Before You Go: completeness correction — 7 October 2026

Follow-up: [one universal travel brief](BEFORE_YOU_GO_UNIVERSAL_BRIEF_REPORT.md) supersedes this historical report's grouped practical repair, background model verification and required unavailable-card behavior.

## Confirmed root cause

The previous array-based schema allowed omitted countries/sections and empty practical facts. A single accepted fact could mark the entire response AI-generated. With no usable generation and no previous snapshot, the service persisted its deterministic/minimal fallback with `generatedAt` and a fresh database timestamp. The five-minute protection checked age/version rather than coverage. The panel announced “Saved information is already up to date” and hid empty practical sections. The standalone PDF also hid those sections; Full Travel Book independently filtered them out.

The exact reported four-card state was reproduced from the code: Entry/Emergency fallback paragraphs, saved currency, calculated timezone. The original real production snapshot/provider response was not available locally, so its particular provider failure or rejection history is not claimed. The browser regression intentionally simulates a provider outage for the Kyoto/Romania context.

## Files changed

- New `server/premium-travel/essentials-generation.js`: dedicated instruction blocks, named per-section schemas and normalized coverage evaluation.
- `server/premium-travel/essentials-provider.js`: one practical request plus at most one grouped failed-required-section repair; bounded refusal/schema/provider handling and accepted-fact retention.
- `server/premium-travel/essentials-policy.js`: rejection reasons and validated named-field metadata. Existing high-risk/source boundaries remain.
- `server/premium-travel/essentials.js`: version-four context, old snapshot restore, coverage-based cooldown, selective recovery, retained facts and optimistic generation-ID save protection.
- `src/lib/essentials-guidance.js`: shared required fields, readiness/visibility, unavailable copy and accurate update messages.
- `src/components/trip/PremiumTripFeatures.jsx`, `src/styles/premium-trip-features.css`: visible required failure states, compact incomplete status and truthful pending-verification copy.
- `server/premium-travel/essentials-pdf.js`: revalidated saved coverage, required unavailable sections and incomplete banner.
- `server/premium-travel/travel-book.js`: **only its Essentials presentation** uses the same visibility/completeness, retains verified notice/source links, passport/update context and provenance. Other book sections/providers are unchanged.
- `server/tests/destination-essentials.test.js`, `server/tests/essentials-fast-fixture.mjs`: regression and safety fixtures; realistic snapshot compare-and-set behavior.
- `scripts/check-fast-essentials-browser.mjs`: isolated authenticated Kyoto failure/recovery/browser/PDF checks.
- This report and a follow-up pointer in `BEFORE_YOU_GO_DESTINATION_REFINEMENT_REPORT.md`.

No routes, API client, database tables, dependencies or provider settings were changed. No migration is required. Calendar, Maps, Weather, Wallet, billing, itinerary generation and the existing teaser styling were not changed.

## State and completeness

`generation.status` is independently calculated as `complete`, `partial` or `failed`; `generation.current` requires the current content version. `generatedAt` records when a result was produced and does not establish success. Per-section `generation.status` uses `ready`, `missing`, `failed`, `rejected` or optional `not_applicable`, with bounded missing-field/rejection metadata. Provider errors/bodies and private context are not stored in rejection diagnostics.

Required practical sections are **Money, Power, Connectivity, Time zone, Local transport, Tipping/customs and Rules/etiquette**. Money requires separate generated currency/payments/ATM fields in addition to the deterministic saved-currency label. Power requires specifications and compatibility, plus actual plug-type/voltage/frequency content. Connectivity requires options/activation/trip-length recommendation. Transport requires systems/payment/recommendations, with optional approximate fares. Customs requires concrete norms/situations. Rules requires at least four surviving distinct social facts. Timezone must contain calculated facts, not AI claims.

Entry/Emergency stay represented with conservative official evidence or explicit unavailable/passport-choice states. Other essentials and Useful phrases are optional; empty optional content can be omitted, and phrases need four surviving useful entries to appear. Optional failures do not make an otherwise complete required guide incomplete. Important notices remain a separate verified banner. Legal evidence supplements the four-to-eight etiquette facts rather than crowding them out.

All required cards remain visible on generation, parsing or filtering failure, using “We couldn't prepare this section yet. Try updating the travel essentials again.” Surviving useful content remains visible alongside a missing-coverage state. There is no generic invented fallback. A failed guide no longer claims it is ready while official verification is pending.

## Generation, recovery and cooldown

One initial structured practical request covers the supplied destinations, with every country and section required as a **named schema property**. Money, Power, Connectivity, Transport, Customs, Rules, Other essentials and Phrases each have their own detailed instruction block/schema. The primary prompt uses public itinerary context and an inclusive date-derived duration (6–9 October = four days). It does not ask AI to calculate timezone or infer device/origin standards from nationality.

After filtering, the provider evaluates required generated coverage. It makes **at most one further grouped request** for the missing/rejected/failed required sections. Successful sections and optional sections are absent from the repair schema. Accepted partial facts survive an unsuccessful repair. Each practical request has the existing 15-second deadline; the two-request practical path is bounded to approximately 30 seconds plus local processing. Existing configured provider timeouts can be shorter. There are no unbounded loops or twelve per-section requests.

For an existing incomplete snapshot, an explicit update requests only its incomplete required generated sections. Successful saved sections are reused. There is a persisted **60-second failed/partial retry protection**, separate from the **five-minute complete-guide cooldown**. A complete/current recent snapshot can return `updateSkipped`; a blocked incomplete snapshot returns `retryBlocked/updateIncomplete` with honest copy, never “already up to date.” Opening/restoring/clearing the panel never requests generation. A later explicit update can recover failed sections without regenerating successful ones.

Snapshot version/context is now four. Version-three, version-two and legacy hashes remain readable without writes or generation merely on open. Old unstructured guidance stays visible but is not incorrectly certified against the new named-field contract; an explicit update upgrades it. Content version is part of the cache identity. Normalization rechecks coverage after filtering.

Frontend immediate locks/version guards and backend in-process promise sharing remain. Snapshot persistence now uses an optimistic generation-ID compare-and-set (or insert-if-absent), preventing late practical work from overwriting a newer saved generation. Background verification retains its generation-ID guard. Successful existing facts, deterministic data and still-valid official evidence survive partial failure.

## Safety, PDF and call counts

Visa, duration, passport validity, immigration/forms, emergency numbers, actual laws and serious notices still require the existing current official page evidence, nationality matching and date/relevance checks. One grouped supplemental request retains the two-search/three-page bounds and existing deadlines. No practical searches were added. Risk filtering was not loosened; generic filler recognition additionally covers the explicitly rejected carrier/Wi-Fi/tipping/customs advice. Input remains limited to country/city/dates/passport code, trusted timezone/currency and approved public attraction/transport context. Passenger names, email, payments, booking documents, private notes, ticket URLs and accommodation street addresses remain excluded.

Both PDF variants read the saved normalized snapshot and make **zero AI/search generation calls**. Incomplete exports remain allowed, but explicitly state that information is incomplete and include honest required unavailable sections. Dates, passport, sources, provenance and update information remain. Standalone PDF preserves the existing branding and compact layout. Full Travel Book changes only its Essentials chapter; map/route/calendar/wallet behavior is unchanged.

Model requests per explicit update:

- Previously: one practical + one supplemental verification normally; incomplete content could still be treated as successful.
- Now: **one practical + one supplemental verification normally**; **at most two practical + one supplemental** if required coverage needs repair.
- A later partial recovery requests only incomplete required sections, still with at most one grouped repair. Zero practical requests when only a deterministic missing field remains and no generated section needs repair.
- Cached open/reopen/restore, protected cooldown and PDF export: **zero additional generation requests**. Unconfigured provider: no provider calls and an honest failure state.

These are configured/request-attempt counts, not live billing measurements. A failed request can still have provider costs. Repeated explicit failed updates become eligible after the one-minute protection; there is no background retry on open.

## Validation results

**Passed: 24 focused Destination Essentials server tests**, targeted component ESLint and existing TypeScript/contracts checks. Tests reproduce minimal fallback, missing Money/Tipping-only output, generic rejection, partially successful repair, complete versus incomplete cooldown, Kyoto/Romania coverage, saved PDF failures, refusal/incomplete-schema handling, null facts, electrical specifications/duration, legacy v2/v3 restoration, coalescing, and late practical/verification saves. Existing conservative entry/emergency/legal/notice/timezone/privacy tests remain passing.

The initial server run had three failures in new test expectations/fixtures: escaped HTML assertions and a mock SELECT sharing mutable snapshot objects. Those were corrected; a final run has **24 passed, zero failed/skipped**. No full suite was run.

The focused authenticated browser/PDF check passed against the freshly built app, using **only `tripsync_test`**, fixture users/settings, mocked provider responses and blocked live external calls. Existing fixture bootstrap runs existing schema setup only in that test database; no application migration or production write was performed. Users/settings are cleaned up afterward.

- Kyoto, Japan, 6–9 October 2026, Romania: provider outage produced `failed` despite a timestamp; all seven required cards remained represented; cooldown/reopen did not generate or claim freshness.
- After advancing only the isolated fixture's backend clock beyond the 60-second protection, recovery requested six failed required sections, then repaired only Power/Connectivity/Transport. Money/Customs/Rules were preserved. Final normalized required coverage was complete.
- A separate successful Moldova context checks optional Japanese phrases/Other essentials and real verifier-validated **simulated** official entry/emergency/notice evidence. The unavailable Romania evidence is not invented.
- Duplicate changes, delayed stale reads, retained content/spinner, reduced motion, clear selection and successful complete cooldown remain checked.
- Authenticated standalone incomplete/complete PDF exports and Full Travel Book succeeded; exports added **zero model requests**. Source URLs, provenance and completeness HTML were checked. Existing free/cross-owner/anonymous denials and unchanged itinerary/credit ledger were checked.
- Desktop **1440 px** / mobile **390 px** passed document/modal horizontal-overflow and browser-error checks. Normal viewport and full-guide screenshots were inspected. Full-guide captures temporarily expand the fixture modal only for the screenshot; application layout is not changed.
- Final fixture totals: **five mocked practical requests, three mocked supplemental requests**. **Zero live provider/search/map calls or billed credits.** Its failure responses are intentional fixtures, not live production failures.
- Production Vite build passed. **Two builds ran**: visual inspection after the first browser pass found the old pending “Your guide is ready” copy on a failed guide; that was corrected and the affected component/build/browser checks were repeated. Both builds passed with only the existing large-bundle advisory.

Commands: `node --test server/tests/destination-essentials.test.js`; `node node_modules/eslint/bin/eslint.js src/components/trip/PremiumTripFeatures.jsx --quiet`; `node node_modules/typescript/bin/tsc -p jsconfig.json`; `npm.cmd run build`; `MYSQL_TEST_DATABASE=tripsync_test node scripts/check-fast-essentials-browser.mjs` (set the variable using PowerShell on Windows).

## Artifacts and remaining limits

Artifacts are in `.local/essentials-completeness/`: `report.json`, `failed-desktop.png`, `failed-mobile.png`, `failed-desktop-guide.png`, `failed-mobile-guide.png`, `kyoto-desktop.png`, `kyoto-mobile.png`, `kyoto-desktop-guide.png`, `kyoto-mobile-guide.png`, loading screenshots, `before-you-go.pdf/html`, `incomplete-before-you-go.pdf/html`, `kyoto-before-you-go.pdf`, and `full-book-reuse.pdf`. These are explicitly offline fixtures, not current Japanese visa, warning or fare advice.

Actual provider availability/latency/content quality and production configuration were not measured. Named-field, lexical and electrical checks improve deterministic coverage but do not prove semantic factual accuracy. Conservative filters can still reject otherwise useful wording; failure is now visible and bounded recovery is available. When both attempts fail, the required card stays honest rather than inventing guidance. Legacy guidance needs an explicit update for the new contract. Additional destinations lacking a trusted timezone stay incomplete rather than receiving a guessed timezone. In-flight request coalescing is per Node process: optimistic saves protect against stale overwrites across workers, but do not globally prevent duplicate provider charges across workers. Supplemental verification remains best effort if the backend terminates.

**Local only. No deployment, production-data/configuration change, new provider key, database migration, full test suite or production backend restart.**
