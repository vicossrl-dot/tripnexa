# Before You Go: destination briefing refinement — 7 October 2026

Follow-up: [completeness correction](BEFORE_YOU_GO_COMPLETENESS_REPORT.md) supersedes this historical report's empty-required-card omission and age-only cooldown behavior. The new version keeps required sections visible, tracks complete/partial/failed coverage and uses one structured practical request plus at most one grouped failed-section repair.

## Scope and files

Only Destination Essentials content, snapshot normalization, its existing panel and standalone Essentials PDF were refined. No Calendar, Maps, Weather, Wallet, billing, itinerary generation, schema, routes or API client changes in this refinement. No deployment.

- `server/premium-travel/essentials-provider.js`: specific whole-guide prompt and bounded critical verification.
- `server/premium-travel/essentials-policy.js`: generic-content and sensitive-claim filtering.
- `server/premium-travel/essentials.js`: safe itinerary/departure context, versioned snapshots, calculated time facts and merge behavior.
- New `server/premium-travel/essentials-time.js`: IANA date offsets and trusted saved departure timezone.
- `server/premium-travel/essentials-sources.js`, `src/lib/essentials-guidance.js`: shared section definitions, visibility, limits and authority links.
- `src/components/trip/PremiumTripFeatures.jsx`, `src/styles/premium-trip-features.css`: loading status/spinner, existing content retention, compact cards and verified notice.
- `server/premium-travel/essentials-pdf.js`: same useful sections/phrases/notices, verified links and authority list.
- `server/tests/destination-essentials.test.js`, `server/tests/essentials-fast-fixture.mjs`, `scripts/check-fast-essentials-browser.mjs`: targeted refinement checks; `scripts/check-fast-essentials.mjs` reuses the existing coordinated runner and adds a resume option for the affected test stage.
- This report and a follow-up pointer in the previous fast-guide report.

## Exact structure

1. Entry & documents — selected passport → destination; verified entry facts or explicit unavailable/passport-choice state with official entry link.
2. Money & currency — local currency and destination-specific cash/cards/ATMs; saved trip currency is labelled separately.
3. Power & plugs — types, voltage, frequency/region and adapter/converter implications.
4. Connectivity / SIM / eSIM — concrete local options and recommendation for the actual trip duration.
5. Time zone — computed destination name/IANA timezone/UTC offset; date-specific departure difference and 09:00 example when a reliable origin timezone exists.
6. Local transport — actual city modes/operators/cards/passes, approximate fares only when reasonably known, and saved public attraction/day context.
7. Emergency numbers — concise source-backed numbers only, otherwise explicit unavailable state with official emergency link where registered.
8. Tipping & local customs — concrete destination expectations.
9. Local rules & etiquette — four to eight short social etiquette facts; actual legal requirements remain official-only.
10. Other essentials — optional; useful destination-specific facts only.

**Useful phrases** is optional (four to six facts, local script/romanization/English). **Important travel notice** is a separate compact banner, never a standard generic card. Unavailable/empty practical cards are omitted, rather than filled with generic reminders. The old permanent **Health & safety** and **Water & practical basics** cards are removed, including from the standalone PDF and legacy snapshot presentation.

## Prompt, context and source protections

One primary structured request still produces the whole guide. The prompt explicitly asks for a practical pre-departure briefing for a real traveler and forbids generic advice/filling space. Per-section instructions request concrete destination/city systems, names, electrical specifications, local payment/tipping/etiquette, and a short-trip connectivity conclusion. Generic filler is additionally filtered on the server. Itinerary inputs contain selected public attraction names/cities/dates and transport-day mode summaries, not booking documents, passenger names, email, payment details, private notes, ticket URLs or accommodation addresses. Saved arrival city/mode is supplied only where known. No exact exchange rate/cash budget is invented.

Passport nationality is never used as origin. The current Trip schema stores arrival/departure endpoints **at the destination**, so its `departure_country` is deliberately not treated as home/origin. A saved arriving flight can supply its explicit departure timezone; conflicting/unknown records leave origin unknown. Explicit known origin timezone/country fields are accepted if available, with a single-timezone mapping for known Moldova/Romania. Current forms do not collect a separate home-country field, so many real trips will correctly show destination offset only. Offset calculation uses runtime IANA/Intl data for each trip date and separates offset/DST ranges; the model cannot overwrite time calculations. For multi-country trips the saved timezone is used for the primary destination only, without guessing additional zones.

Visa, duration, passport validity, arrival/immigration forms, emergency numbers, legal requirements and serious current alerts remain official-source-only. One supplemental request is bounded to two search-tool calls and three unique parallel page reads. It now asks for up to seven concrete entry facts, three emergency facts, legal facts and meaningful dated notices. Every displayed verified statement is an actual matching official-page excerpt, never the model's unsupported paraphrase. Nationality-specific entry excerpts must name the passport nationality; universal passport/form rules must explicitly apply to all foreign visitors without exceptions. Failure leaves a direct authority link and a clear unavailable message.

A notice additionally needs concrete serious impact, destination/city relevance, official evidence containing the start/end dates, and an overlapping trip period. Open-ended notices need dated evidence that they remain in effect/until further notice. Routine precautions are not notices. The banner shows Verified, official source and checked date. Normal etiquette remains visible when supplemental legal facts are added. Existing model/provider, deadlines (15-second primary; 6.5-second supplemental, including 4.5-second search and 1.8-second pages), cooldowns and race protections remain. No new search requests, provider keys or dependencies.

## Loading and layout

The status uses the requested **“Preparing your travel essentials…”** copy and a **24 px animated coral `LoaderCircle`**, rotating smoothly every 0.85 seconds. It is a compact peach status block with `role=status`, polite live announcements and decorative `aria-hidden` icon. With saved content, it explains that the previous guide stays visible. Existing practical cards remain readable, with a subtle coral border while preparing their replacement; only old passport-specific entry claims are removed on a nationality change. Cached verification polling is paused during an update so it cannot replace the current result. Selector/update actions remain disabled during active work. Success/error removes the spinner; reduced-motion displays a static icon with the same status.

Desktop keeps the two-column grid with natural card heights (`align-items:start`), rather than stretched matching-height cards. Mobile remains one column. No blocking overlay or fake progress percentage.

## PDF and snapshots

The owned premium PDF endpoint continues reading the same saved snapshot, without AI calls or additional trip-credit consumption. UI and standalone PDF share visibility rules: useful populated sections, optional phrases, relevant verified notice, passport/destination context, verified clickable sources, last updated time, authority/source list and the compact disclaimer. Empty/irrelevant cards are omitted. Japanese script uses local font fallback, without fetching fonts/images. Full Travel Book's existing route/renderer is unchanged and continues using the saved snapshot without generating AI.

The existing JSON table is reused, **no DB migration**. Guide version 3 gives explicit updates a new content context; reads can restore existing version 2/legacy contexts without regenerating merely on open. Valid prior facts remain available during failures; removed/filler content is filtered on normalization. Context includes the new safe itinerary/origin data so relevant changes select a new snapshot. Same-context five-minute protection, frontend duplicate guard, in-process request sharing and generation-ID verification protection remain.

## Validation

**Passed:** **16 unique targeted tests** (13 Essentials provider/service tests plus three existing premium-entitlement checks), component lint, existing TypeScript contracts, browser/HTTP/PDF checks and **one production build**. Vite emitted the existing large-bundle advisory, with no build errors. The coordinated command was `node scripts/check-fast-essentials.mjs`; its first attempt stopped before build on a JSON-schema syntax error. That error was corrected and the affected stage resumed with `--resume-essentials`; the already-passing entitlement tests were not repeated, and only one build ran. No full suite or deployment.

- **Japan / Moldova / Romania:** one whole-guide model request for each of two new passport contexts. Concrete Type A/B, 100V, Kyoto 60Hz/eastern 50Hz, adapter versus converter, named Kyoto subway/bus/JR/private rail systems and ICOCA, approximate fare labelling, Japanese tipping/chopstick/shoe/queue etiquette and four Japanese-script phrases checked.
- **Time:** calculated JST/UTC+09:00 and saved inbound-flight departure difference (**6 hours**, 09:00 → 15:00). Separate fixtures crossing Moldova's October DST change verified **6/7-hour** differences. Unknown origin and nationality-only cases produced no invented origin difference. Safe public attraction context was included; passenger/document fields were excluded.
- **Official:** concrete simulated visa/passport/form evidence, official emergency-number excerpts, and a serious dated notice were accepted only with matching actual page fixtures. Unsupported paraphrases, missing numbers, wrong nationality, generic notices, missing/mismatched dates, out-of-period notices and stale evidence were rejected. No permanent Health/Water cards; empty optional cards omitted. Supplemental legal facts retained ordinary etiquette.
- **Loading:** the exact preferred copy and visible animated coral spinner; disabled selector and duplicate-event guard; saved cards retained during manual updates and simulated errors; subtle preparing border; spinner removed on completion/error. Reduced-motion yielded a static icon. Loading and final-state screenshots inspected at **1440 / 390 px**, with no horizontal document/modal overflow or browser errors.
- **Snapshots:** cached open/reopen/restore did not generate AI; stale Moldova cached reads could not replace Romania selection; clearing made a cached GET only and restored the passport prompt. Manual cooldown worked; later successful updates were checked in service tests. Version-two snapshots restored without generation and upgraded only on explicit update.
- **PDF:** actual premium Essentials PDF **3 pages**, with the same improved content, Japanese phrases, relevant notice, source links/list and provenance/update time. Repeated PDF downloads and actual Full Travel Book generation made **zero extra AI calls**. Free, cross-owner and anonymous requests were rejected; fixture credit ledger/balances and itinerary remained unchanged.
- **Costs:** two primary and two supplemental mocked model requests across the two new contexts; zero live model/search/map requests or billed provider credits. All external network requests were blocked. Visa/emergency/notice fixtures are explicitly simulated test evidence, **not current Japanese entry or warning advice**. The isolated `tripsync_test` users/settings were cleaned up; production data/configuration was untouched.

Artifacts in `.local/refined-essentials/`: `before-you-go.pdf`, `before-you-go.html`, `full-book-reuse.pdf`, `loading-desktop.png`, `loading-mobile.png`, `desktop.png`, `mobile.png`, `report.json`.

## Remaining limits

No live model latency, fares, visa result or government availability is claimed. The primary prompt/filter improves content but cannot guarantee the semantic accuracy of AI-only practical details. Critical verification is deliberately small/conservative and may produce an honest unavailable state for disjoint tables, unreadable pages, unnamed nationalities or undated notices. No unknown origin/city systems or rates are invented. Other countries/cities need the configured model and existing source registry; unknown additional timezones are omitted. Runtime timezone data must remain current. Background verification is best effort; existing coalescing is per backend process. Multi-country/long guides can exceed the normal single-country PDF page count. Saved early-version guides may need one explicit update for the new richer content, without automatic costs on open. The available local validation runtime was Node 24.21; the repository still declares Node 22, and no runtime/package changes were made.
