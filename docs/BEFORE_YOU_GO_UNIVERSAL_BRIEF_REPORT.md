# Before You Go: one universal travel brief — 7 October 2026

Follow-up: [real-provider contract audit](BEFORE_YOU_GO_LIVE_CONTRACT_REPORT.md) documents the single live Bucharest/Panama timeout, final 45-second bound, nullable sections, parsing diagnostics and cancellation. The final bounds have not been live-retested.

This supersedes the practical-generation/repair/background-verification architecture in the [completeness report](BEFORE_YOU_GO_COMPLETENESS_REPORT.md). Implementation is local only; no deployment, production-data/configuration write, migration or production backend restart.

## Architecture and request counts

An eligible explicit update makes **one** request through the existing server-side Responses provider. It generates the entire named, structured travel brief with `web_search` enabled inside that same request, `store:false`, and a maximum of two model-selected grouped search-tool calls. There is no practical repair request, selective-section regeneration, supplemental model request, background verification task or verification polling. Opening/restoring/clearing the panel and either PDF export make **zero** model requests. Complete-context five-minute protection and failure/partial sixty-second protection also make zero requests when they block an update. An unconfigured provider makes zero requests.

The request receives the safe passport/destination/date/duration/currency/timezone context, reliably known origin, public selected attractions and transport-day modes, and stay country/city/date summaries. It excludes names, email, passenger/document/payment data, notes, private ticket URLs, booking references and accommodation street addresses. The model/key/provider settings and existing quota/telemetry wrapper are unchanged. Inclusive duration for 6–9 October is four days.

The primary deadline is **25 seconds**, subject to the provider's existing shorter configured timeout. After it returns, only candidate critical evidence is checked locally: at most **three unique authority pages in parallel**, **1.8 seconds per page**, with a **2.2-second overall validation budget**. These are HTTP reads, not model calls. Practical tips do not need URLs, quotes or page reads. A page failure/timeout returns the practical brief with conservative unavailable critical information. No automatic retry.

This follows the official [Responses web-search source metadata documentation](https://developers.openai.com/api/docs/guides/tools-web-search). One Responses request can incur model-token and search-tool charges; one request does not mean one search credit. No live costs or latency were measured.

## Saved guide and sections

Each destination is a required named schema property. Ordinary content has dedicated instruction blocks, nullable individual fields where genuinely unknown, and bounded facts:

1. Entry & documents — current selected-nationality entry requirements, validity, stay conditions and registrations, exclusively official evidence or a specific authority-confirmation message.
2. Money & payments — currency/symbol, cash/card/foreign-card reality, ATMs, tipping/payment quirks and a trip recommendation. Saved trip currency remains separately identified.
3. Power & plugs — exact plug types/voltage/city frequency, origin compatibility only when known, adapter versus converter and universal-voltage chargers.
4. Connectivity / SIM / eSIM — actual visitor options, acquisition/setup, local-number implications, Wi-Fi and a duration-specific recommendation.
5. Time & time difference — calculated IANA name/abbreviation/date-specific UTC offset, origin difference and example when reliably known; DST/offset ranges are calculated.
6. Getting around — actual city operators/modes/cards/payments, attraction-informed recommendations and optional reasonably supported approximate fares.
7. Emergency numbers — verified official police/fire/ambulance/tourist-help evidence, or the existing authority-link fallback.
8. Local customs & etiquette — combines tipping and visitor etiquette into **5–8 concrete social facts**, with official legal evidence appended separately from ordinary guidance.
9. Useful phrases — **5–7** requested local-script/romanization/English-meaning objects. Those fields survive snapshot normalization; useful surviving phrases remain visible.
10. Important to know — optional, nonduplicated destination specifics; empty content is omitted.

A meaningful, official, date-relevant current notice remains a separate optional banner. No permanent Health/Safety or Water cards. Empty ordinary sections and optional facts are omitted; the repeated per-card “We couldn't prepare this section yet” UI/PDF blocks are removed. Coverage remains descriptive and supports honest cooldown/error messages, but never schedules repairs or labels a provider outage as a successful fresh guide.

## Critical verification and provenance

Visa/entry/passport validity/immigration/forms, emergency numbers, actual legal requirements and serious notices remain official-only. A candidate URL must occur in completed search-source metadata from the **same response**, pass the authority registry, and have matching actual readable page evidence. Redirected nonofficial pages, invented/trusted/UGC URLs, unsupported paraphrases and stale evidence are rejected. Displayed critical facts use the verified excerpt, never an unsupported model paraphrase. Ordinary practical guidance needs neither exact quotes nor official links.

Nationality-specific entry evidence must match the selected passport. Universal visitor rules must apply explicitly to all foreign visitors without exceptions. A targeted test identified and corrected the historical case where mentioning Romania in an exception could satisfy the nationality match. No entry evidence is retrieved/accepted without a passport. Emergency numbers are not invented. Legal facts cannot be smuggled through practical sections. Notice evidence still requires concrete serious impact, destination relevance and evidenced overlapping dates; routine precautions render nothing.

The server stamps `sourceType:official`, `sourceUrl`, `verifiedAt`, `checkedAt` and `evidenceType:page`. Only current officially verified facts receive **✓ Verified** and a clickable **Official source**. AI-only/trusted guidance does not receive those labels. The panel and PDFs have the shared single About note and an official-authorities/source list.

## Origin and time

Reliable departure context from saved inbound transport takes priority over explicit trip origin fields. Matching arrival date/destination timezone prevents treating a return flight as the inbound origin. Conflicting transport origin data is not trusted. Existing explicit origin fields are the second choice. There is no reliable profile-residence product field in the current schema, so none is guessed or introduced.

A saved departure IANA zone can identify Moldova/Romania using the existing single-country timezone mapping; it does **not** establish the actual departure city. City is supplied only when explicitly known. Destination `departure_country` remains excluded as a home/origin proxy. Passport is never origin. Unknown origin retains destination time and “Add your departure city to see the time difference.” The runtime computes actual trip-date offsets and 09:00 conversion, including DST ranges. The current Wallet schema normally saves airport codes/timezones, not a separate departure-city field; this limitation is retained without new schema/UI fields or geocoding.

## Snapshots, UI and PDFs

The existing private `trip_essentials_snapshots` JSON table is reused, with content/context version **five**. Historical v2/v3/v4 and legacy hash inputs remain readable without writes or generation on open. Old Rules facts are folded into the combined Customs section. Only explicit updates upgrade content. A failed primary update retains useful previous facts and their generated timestamp; an initial failed update has no success timestamp. Useful facts survive partial output/filtering. In-process sharing, frontend immediate guards and generation-ID compare-and-set saves protect duplicate/racing updates. Cross-process duplicate billing is still not globally locked.

The existing animated coral spinner and “Preparing your travel essentials…” remain. Selector/actions disable during work; previous cards remain visible; stale passport/read responses cannot overwrite the current selection. Reduced motion keeps the spinner static. No modal/teaser/premium-gating redesign.

Standalone Essentials PDF and Full Travel Book read/revalidate the **same saved normalized guide**, without AI/search generation or new trip-credit consumption. Useful populated sections, phrases, dates/passport/update time, current official provenance/links and About/source list are preserved. Full Travel Book changes only its Essentials chapter. Quick PDF, maps/Geoapify/cache/route QR, Calendar, Weather, Wallet, billing, affiliates and itinerary generation are unchanged.

## Files changed

- `server/premium-travel/essentials-generation.js`, `essentials-provider.js`, `essentials-policy.js`, `essentials.js`, `essentials-time.js`: universal instructions/schema, one request, bounded non-AI evidence validation, origin/snapshot compatibility and preservation.
- `src/lib/essentials-guidance.js`, `src/components/trip/PremiumTripFeatures.jsx`, `src/styles/premium-trip-features.css`: combined sections/visibility/copy, removal of polling and repetitive unavailable blocks; spinner retained.
- `server/premium-travel/essentials-pdf.js`, `travel-book.js`: saved populated content and shared provenance/source presentation, only Essentials functionality.
- `server/tests/destination-essentials.test.js`, `server/tests/essentials-fast-fixture.mjs`: single-request/safety/privacy/cache/race/origin/legacy/PDF fixtures.
- `scripts/check-fast-essentials.mjs`, `scripts/check-fast-essentials-browser.mjs`: focused validation runner and isolated browser/HTTP/PDF checks.
- This report; historical completeness report gets a follow-up pointer.

No routes, API client, provider keys, dependencies, database entities or migrations changed.

## Validation and remaining limits

**24 unique targeted tests passed**: 16 Essentials, five existing Travel Book and three existing premium-entitlement tests. Component ESLint and existing TypeScript contracts passed. **One production build passed**, with the existing large-bundle advisory. The initial validation stopped before lint/build on the newly exposed nationality-exception bug (23/24); that was corrected and the 16 affected Essentials tests resumed, without repeating the already-passing Travel Book/access tests. Final origin review removed the timezone-to-city assumption; its targeted Origin test and affected browser/PDF validation were repeated, without another build. There was no full-suite run.

Browser/actual authenticated routes passed at **1440 / 390 px**, with no document/modal overflow or browser errors. Romanian/Moldovan passport contexts each get one fresh primary request; one later manual fresh update gets one. Final fixture totals are **three primary calls, zero repair calls, zero supplemental model calls**. Cooldown/open/restore/clear/PDF reuse add none. Spinner animation/static reduced motion, retained content, duplicate/stale-read guards, actual ownership/premium denials and unchanged saved itinerary/credit ledger were checked.

The actual Essentials PDF is **three pages**, with a clickable official source. Actual Full Travel Book export succeeded and reused the same guide with zero additional model calls. Simulated official page evidence was validated through the same non-AI validator and restored from the saved test snapshot for UI/PDF checks; it is explicitly **not current Japan entry or emergency advice**. The authenticated primary-route fixtures return unavailable critical evidence; server tests exercise integrated successful/failed critical validation within one model attempt. No live external AI/search/map calls or credits were consumed. Only the isolated `tripsync_test` database/fixture users/settings were used and cleaned up; production data/configuration was untouched.

Commands: `node scripts/check-fast-essentials.mjs`; affected-stage resume `node scripts/check-fast-essentials.mjs --resume-essentials`; final origin check `node --test --test-name-pattern=Origin server/tests/destination-essentials.test.js`; browser recheck with `MYSQL_TEST_DATABASE=tripsync_test node scripts/check-fast-essentials-browser.mjs` (set with PowerShell on Windows).

Artifacts: `.local/universal-essentials/report.json`, desktop/mobile/whole-guide/loading screenshots, `before-you-go.pdf/html`, `romania-before-you-go.pdf`, `full-book-reuse.pdf`. Screenshots were visually inspected. Whole-guide captures expand only the test modal for the screenshot; production layout is unchanged.

Limitations: live model latency/content quality/account tool support/billing were not measured. A strict schema and safety filters do not prove the factual accuracy of ordinary AI advice. Official validation is intentionally conservative and bounded to three pages; complex tables/unavailable sources/unnamed nationalities can retain an honest authority-confirmation state. Search calls may be omitted by the model when inconclusive; this never permits memory-only critical claims. The nonstreaming Responses call is atomic: if that entire request stalls before returning usable JSON, no new practical text can be extracted; the timeout retains the prior saved guide (or a single update failure), without another model attempt. Missing ordinary content is omitted rather than retried automatically. Large multi-country guides can exceed the normal 2–4-page target/output budget. Unknown origin/city/additional destination timezones are not guessed.
