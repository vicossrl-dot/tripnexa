# Files changed by final multilingual QA

The workspace already contained the i18n foundation, stage 2 and unrelated changes. This list includes only this QA task.

Checks, fixtures and reports:

- `package.json`
- `scripts/locale-coverage.mjs` (new)
- `scripts/multilingual-browser-qa.mjs` (new)
- `scripts/inspect-multilingual-pdfs.mjs` (new)
- `scripts/check-premium-travel-browser.mjs`
- `scripts/check-i18n-browser.mjs`
- `server/tests/locale-coverage.test.js` (new)
- `server/tests/i18n-server.test.js`
- `server/tests/i18n-integration.mjs`
- `server/tests/i18n-pdf-fixture.mjs`
- `docs/I18N_FINAL_QA.md` (new)
- `docs/I18N_QA_FILES.md` (new)
- `docs/I18N_QA_ISSUES.json` (new)

Targeted localization corrections:

- `src/i18n/server-messages.js`
- `src/components/itinerary/InteractiveTripMaps.jsx`
- `src/components/itinerary/TransportCard.jsx`
- `src/components/itinerary/TripWeather.jsx`
- `src/components/itinerary/TicketOptions.jsx`
- `src/components/planning/StepStay.jsx`
- `src/components/planning/StepFinalize.jsx`
- `src/components/billing/Billing.jsx`
- `src/components/trip/TimelineView.jsx`
- `src/components/trip/PremiumTripFeatures.jsx`
- `src/pages/Itinerary.jsx`
- `src/pages/Profile.jsx`
- `server/i18n.js`
- `server/pdf-i18n.js`
- `server/itinerary-pdf.js`
- `server/premium-travel/travel-book.js`

No new schema/migration or dependency changes. `.env`, secrets, production database, deployment scripts, Admin/Super Admin, marketing website and Blog were not modified by this task. Ignored `.local/i18n` contains fixture PDFs, raster images, browser profiles/screenshots, cache fixtures, test logs and a temporary local edit helper.
