# Final local multilingual QA — 8 October 2026

**Overall result: NOT GREEN.** Functional regressions pass, but the strict multilingual release gate fails because substantial user-facing UI copy still uses English fallback. This is a recorded release blocker, not a missing-key success presented as complete localization.

The latest instruction superseded deployment: staging was intentionally removed and was not created, restored, configured or deployed. Production was not accessed or deployed. There was no commit/push, `.env`/secret change, production database operation, deployment-script modification, global LiteSpeed restart or termination of unrelated Node processes. Work was local to `C:\travel`; database fixtures used loopback-only `tripsync_test`.

## Coverage gate and remaining issue

`npm run i18n:coverage` parses the current user-facing React source, including translation calls and catalogued source-copy bridges. It fails on missing/empty required keys, interpolation mismatches, unknown keys, conflicting UI/server keys, translated schema-property lookups and translated internal identifiers. Its regression is part of `npm test`. Admin, marketing, historical exports and Blog are excluded. The legacy administrator-only 404 note is excluded by its existing role guard.

`npm run i18n:release-check` adds a strict check for English-identical required values and direct untranslated JSX copy. It currently exits **1**. Official names/units have a small explicit exemption list. Identical-language cognates can be review candidates; the report does not assume every candidate is a translation defect. Browser observation independently confirms untranslated English sentences, including “Log in to your account” and “Don't have an account?” in Romanian.

Current inventory: 1,722 UI keys, 555 shared server keys, 1,055 required source/bridge keys; **zero missing keys or identifier-contract violations**. The source audit additionally flags 146 hard-coded display-copy candidates for bridge review. These are not all direct JSX failures; some already pass through `translateText`.

| Locale | Required English-fallback candidates |
| --- | ---: |
| ro | 878 |
| ru | 875 |
| de | 877 |
| fr | 883 |
| es | 875 |

The issue inventory contains exact keys, source English and affected files: [I18N_QA_ISSUES.json](I18N_QA_ISSUES.json). It also records visible fallback findings from the browser matrix. Completing and reviewing the remaining UI translations is required before calling multilingual QA fully green. No external catalog upload or live translation-provider call was made in this QA task.

## Corrections made during QA

- Localized map day/summary/route copy, transport mode/source display, climate/budget/subscription notes, check-in/check-out, itinerary eyebrow, timeline day and Account To-Do label. Layout/design was preserved.
- Ticket API requests now send the selected locale, and the ticket panel refreshes its response when locale changes.
- Before You Go authority lookup uses stable `entry`/`emergency` property names. The previous translated lookup was caught during the internal-value audit. Official-evidence validation logic was not modified.
- PDF quantities now reuse the shared plural catalog and `Intl.PluralRules`/`Intl.NumberFormat`, including Romanian singular and Russian one/few/many forms.
- Separated `validation.fieldRequired` (server field validation) from `validation.required` (native form validation). Their previous key collision exposed the raw `{{field}}` placeholder in forms. The coverage gate rejects future collisions.
- Updated the old premium browser fixture to provide evidence through the current verifier and assert the current “Last updated” label. It must contain an actually verified fixture source; verification assertions were strengthened, not removed.

## Validation

Local runtime: **Node 22.23.3**, installed Chrome. Exact production Node 22.18.0 and Linux/Passenger/CloudLinux/CageFS were not exercised in this task.

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | **203/203 PASS**, zero skipped |
| `npm run i18n:check` | PASS: six-locale key/interpolation parity |
| `npm run i18n:server-check` | PASS: 391 scoped static messages/templates |
| `npm run i18n:coverage` | PASS required-key/contract checks; fallback/copy warnings recorded |
| `npm run i18n:release-check` | **FAIL: English UI fallbacks** |
| `npm run test:integration` | 37/37 PASS on `tripsync_test` |
| `npm run test:billing` | 22/22 PASS on `tripsync_test` |
| `npm run test:maps` | 8/8 PASS on `tripsync_test` |
| `npm run test:public` | 14/14 PASS on `tripsync_test` |
| `npm run test:i18n:integration` | PASS: all six saved preferences, new-device sessions, logout/login, owner isolation, translated enum rejection |
| Full local browser smoke with `--full --mock-providers` | PASS: wizard autosave/reload, AI suggestions and itinerary edits, bookings, sharing, Account; no JS exceptions |
| `npm run test:i18n:persistence` | PASS: all six immediate locale selections, required/email validation, local reload, guest/account precedence, unsaved input/focus, Account preference and Admin English |
| `npm run test:i18n:browser` | **228 functional cases PASS**; visible English fallback candidates found on 185 locale/area combinations |
| Premium browser/API/download smoke | PASS: anonymous/owner/free protections, all 18 locale/PDF variant HTTP downloads and selected-day ICS, current verified-evidence UI, desktop/mobile layout, unchanged itinerary/credit ledger; export rate limiter respected, zero live model requests |
| `npm run test:i18n:pdf` | **18/18 PASS**: all three PDF variants in every locale |
| `npm run test:i18n:pdf-inspect` | **18/18 PASS**: extracted localized labels/dates, searchable text and first-page rasters |
| `npm run build` | PASS; existing Vite >500 kB chunk warning |

The browser matrix covers auth/reset, Trips and creation, AI trip names, all six planning steps/AI suggestions, itinerary edit preview, meals/restaurants/transport, Maps, Weather, Trip Health/review, all Wallet categories, sharing controls/public reader, tickets/affiliate, download/calendar options, Before You Go and all Account tabs. This proves locale propagation and rendering with local fixtures; it does not prove the quality of a live model's prose or live OAuth/provider availability.

Automated server tests cover all-locale AI instructions with unchanged JSON schemas, unknown-locale/English fallback, preserved enum/status/error codes, canonical text/evidence, localized emails/calendar, source/version cache reuse and isolation. Three complete language-switch cycles translate an unchanged source once per non-English locale; every cache-only PDF read makes zero additional model calls.

All 18 PDFs embed Noto Sans and contain searchable Unicode maps; Russian passes Cyrillic mapping and extracted-text checks for Quick PDF, Before You Go and Full Travel Book. Cached per-locale fixture prose is prepared before rendering; rendering cannot call AI or change canonical source. The 18 first-page rasters and all six Full Book itinerary/map page rasters were visually inspected: no missing Cyrillic/diacritic glyphs or visible clipping in these fixtures. Font independence is tested locally, not on production CageFS.

Artifacts are ignored under `.local/i18n`: test/build logs, browser reports/screenshots, `pdf-fixtures` PDFs/text/rasters/contact sheets. Final multilingual browser report: `multilingual-browser-d4e61048-cdfb-4dc7-997c-c8a516a3f212/result.json`.

## Schema and files

No new fields/migration or dependency changes. Existing migrations were rerun only as part of isolated test setup; production migration was not run. Exact task files: [I18N_QA_FILES.md](I18N_QA_FILES.md).
