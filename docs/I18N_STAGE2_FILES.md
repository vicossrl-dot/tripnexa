# Stage 2 file changes

Only this task's changes are listed; the workspace already contained unrelated changes and the stage-1 foundation.

Server:

- `server/i18n.js` — new request-local locale and shared message/date helpers; localized public errors, Admin bypass.
- `server/localized-content.js` — new persistent per-source/per-locale translation cache and model provenance.
- `server/locale-router.js` — new ownership-scoped saved-content display preparation.
- `server/pdf-i18n.js` — new embedded font, localized formatting and cache-only projection context.
- `server/auth-emails.js` — new localized authentication email formatter.
- `server/ai.js` — selected prose language propagation and provenance; schemas preserved.
- `server/app.js` — locale/error middleware and display-preparation router.
- `server/auth.js` — shared authentication email formatter.
- `server/trips.js` — cache-only translations restricted to the public sharing projection.
- `server/meal-options.js` — locale-aware provider/cache lookup and display-only restaurant copy.
- `server/itinerary-pdf.js` — Quick PDF labels/dates/font, font readiness, cache-only export.
- `server/premium-travel/essentials-provider.js` — display locale metadata, canonical English evidence validation retained.
- `server/premium-travel/router.js` — saved-essentials display translation and cache-only calendar export.
- `server/premium-travel/essentials-pdf.js` — localized labels/font/display prose after canonical validation.
- `server/premium-travel/travel-book.js` — localized book labels/dates/font/cache-only prose.
- `server/premium-travel/pdf-day-map.js` — localized schematic labels and embedded-font family.
- `server/premium-travel/calendar.js` — localized event prose; RFC properties/UIDs/dates unchanged.
- `server/assets/fonts/NotoSans.ttf`, `server/assets/fonts/OFL.txt` — new offline Cyrillic-capable font and license.

Shared catalogs and browser clients:

- `src/i18n/server-messages.js`, `src/i18n/server-extra.js` — new shared key catalog composition.
- `src/i18n/server-locales/en.json`, `ro.json`, `ru.json`, `de.json`, `fr.json`, `es.json` — new static server catalogs.
- `src/i18n/runtime.js`, `src/i18n/react.jsx` — saved-prose projection, localized-server-copy lookup and reactive updates.
- `src/i18n/GeneratedContent.jsx` — new display-preparation lifecycle.
- `src/api/client.js`, `src/api/social.js` — locale headers; projection handling/content refresh.
- `src/components/trip/TripUI.jsx` — mounts saved-prose display preparation.
- `src/components/trip/PremiumTripFeatures.jsx` — reloads saved display context when locale changes.
- `src/components/planning/StepSuggestions.jsx` — translated saved suggestion prose.
- `src/components/itinerary/ItineraryDay.jsx`, `ItineraryIdentity.jsx`, `MealOptionsDialog.jsx`, `MealDetails.jsx` — display prose/category/overnight localization.
- `src/pages/PublicTrip.jsx` — shared-reader locale switch/read, localized status/category, official venue names preserved.

Checks/documentation:

- `package.json` — adds `i18n:server-check`; no dependency change.
- `scripts/check-i18n.mjs` — shared server key/interpolation parity.
- `scripts/audit-server-i18n.mjs` — new read-only user-facing server-copy audit.
- `server/tests/i18n-server.test.js` — new automated server/PDF/cache/email/AI tests.
- `server/tests/i18n-pdf-fixture.mjs` — new opt-in local Chromium font/Unicode fixture.
- `server/tests/i18n-integration.mjs` — MySQL locale/ownership/canonical-source regression.
- `server/tests/travel-book.test.js`, `server/tests/destination-essentials.test.js` — English PDF label assertions updated for proper HTML entity escaping; evidence assertions retained.
- `docs/I18N_STAGE2_REPORT.md`, `docs/I18N_STAGE2_FILES.md` — new local implementation/validation report and file list.

No new schema or migration. No dependency downgrade/change. No Admin/Super Admin, marketing website or Blog files changed by this task. No deployment, commit or push.
