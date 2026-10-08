# User application i18n foundation

Local implementation in `C:\travel`. No deployment, commit or push.

## Current status

The translation infrastructure, language selector, persistence, user UI key wiring and Intl formatting are implemented. **The requested complete translation of every screen is not finished.** The non-English catalogues currently include locally reviewed common copy (120 source phrases), validation messages and pluralized quantities. Remaining entries still contain the English source text. English fallback and key parity do not constitute translation-quality/completeness validation.

Bulk translation of the static UI catalogue through Google Translate was rejected by automatic approval review because the external destination and full catalogue payload were not explicitly authorized. No bulk catalogue was transmitted. A user approval question is pending. The reviewable source catalogue is `src/i18n/locales/en.json`; the ignored generation script is `.local/i18n/translate.mjs`. No user records, credentials, uploaded files or live provider responses are inputs to that script.

## Architecture

`src/i18n/runtime.js` is the single locale/translation store. Six checked-in catalogues use common, stable keys. `t(key, values)` supports interpolation, English fallback and Intl plural categories. `translateText` resolves existing static option labels and application/API messages through the same catalogue, preserving internal API values. Unrecognized content passes through. React components subscribe with `useLocale`/`useSyncExternalStore`, so switching language does not reload or remount forms. Dates, numbers and currencies use the active locale through Intl; ISO dates, time serialization, currency codes and schema identifiers remain unchanged. The shared date presentation module keeps its existing English server behavior for PDF callers.

The Radix language dialog uses native language names, keyboard-accessible choices, Escape, focus restoration, selected-state announcements and a scrolling mobile layout. Entry points are the shared auth layout, Home header, TripNavigation beside Trips/Share/Account/export, and My Account. `LocaleRouteSync` updates the document language. Admin routes retain English and are excluded from translation/validation behavior. CSS selectors formerly tied to English aria-label text now use language-neutral classes/data attributes.

Precedence: explicit current choice → authenticated `User.ui_locale` → `tripnexa.locale` in localStorage → first supported browser language → `en`. Regional browser codes normalize to the six supported languages. A sessionStorage pending marker preserves explicit guest selection through login/full-page redirects. AuthContext awaits its authenticated save before the login redirect. Authenticated saves use the existing protected `PATCH /api/auth/me`, are serialized, and acknowledge only the latest choice. Failure retains the local choice and offers retry. Storage-unavailable contexts can still change language without throwing.

## Additive migration

No generic preference store exists. Existing user preference fields and the existing authenticated profile endpoint are reused. `server/schema/User.json` adds nullable `ui_locale`, restricted to `en`, `ro`, `ru`, `de`, `fr`, `es`. `server/migrate.js` creates `VARCHAR(5) NULL` for new installations and adds it only when absent on upgrades. No forced English default overrides browser/local selection. Existing values and security fields remain untouched.

The migration was run twice **only in the loopback `tripsync_test` database**. Production and the ordinary application database were not migrated. Installation later requires the normal `npm run db:migrate` workflow; this task performs no deployment.

## Verification

Validated using the project-local Node 22.23.3 environment:

- `npm run lint` and `npm run typecheck`: passed without suppressing checks.
- `npm run i18n:check`: 1,722 keys, six locales, matching interpolation parameters and no unknown literal keys. This checks structural parity; full non-English translation coverage remains pending.
- `npm test`: 182 passed, zero failed/skipped, including four i18n tests for parity, precedence, interpolation/Intl/plurals and safe nullable user preferences.
- `MYSQL_TEST_DATABASE=tripsync_test`, `node --env-file=.env --test server/tests/i18n-integration.mjs`: passed. Tests migration idempotence, all six persisted choices, authentication requirements, invalid locales, security-field rejection, account isolation and preference restoration after login.
- `node scripts/check-i18n-browser.mjs`: Chrome fixture passed. Tests six immediate language selections, unsaved form retention, Escape/focus restoration, guest choice overriding an existing saved preference, local reload persistence, authenticated persistence, saved preference overriding local fallback, the trip navigation entry, mobile dialog fit, preserved private trip title and English Admin document language. Browser data/API responses are simulated; database persistence is covered separately above. Chrome required execution outside the process sandbox to initialize its renderer.
- `npm run build`: passed; Vite retains its large-chunk advisory.

Browser artifacts and generator/checkpoint files are ignored under `.local/i18n`; see `I18N_FILES.md` for the source file manifest.

## Intentionally deferred to stage 2

AI prompt/output localization, PDF generation and email generation remain unchanged. User-entered trip titles, documents, notes, saved data and live provider content are not automatically translated. Admin/Super Admin, marketing website and Blog are outside this task. Completing the remaining UI catalogue is still **stage 1 work**, not an intentional stage 2 deferral.
