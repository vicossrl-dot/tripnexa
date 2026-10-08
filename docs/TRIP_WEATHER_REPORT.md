# Trip Weather — local implementation and validation

Implemented on 7 October 2026. Additive, informational weather for the authenticated saved itinerary. No deployment, service restart, migration, billing change or automatic itinerary changes.

## Files

- New backend: `server/weather/api.js`, `service.js`, `provider-met.js`, `provider-nasa-power.js`, `cache.js`.
- New UI: `src/components/itinerary/TripWeather.jsx`, `src/lib/trip-weather.js`, `src/styles/trip-weather.css`.
- Integration: added a GET route in `server/trips.js`, client method in `src/api/client.js`, weather provider/action in `src/pages/Itinerary.jsx`, chip inside the existing header in `src/components/itinerary/ItineraryDay.jsx`.
- Tests: `server/tests/weather.test.js`, `server/tests/weather-api.test.js`, `scripts/check-trip-weather-browser.mjs`.

Existing uncommitted work was retained. Maps, scheduling, generation, billing, wallet, tickets, PDF, sharing and public itineraries were not changed by this feature.

## Providers, location and normalization

`GET /api/trips/:id/weather` uses the existing session authentication and trip ownership check, then loads owner-scoped records with parameterized queries. Free and paid users use the same endpoint without an entitlement check or credit consumption. The response is private/no-store and contains a normalized entry for every saved itinerary date; provider responses remain on the server.

Each day selects a dated stay covering that date, with the latest check-in winning deterministically. Otherwise it uses the first scheduled visit/activity or selected restaurant with saved coordinates, including a matching saved place selection when necessary. The destination coordinate is the final fallback. Unknown coordinates stay unknown. Undated stays are not assumed to belong to every day. Restaurant search anchors are not used as restaurant coordinates. Only rounded coordinates and required meteorological parameters leave the server; names, trip identifiers, notes, tickets and credentials do not.

Forecast coverage is determined from MET timestamps converted into the saved trip timezone. A matching local date uses Forecast. Only a successful MET response with no matching date triggers NASA Typical weather. There is no fixed forecast horizon. A MET outage is Weather unavailable, not an inferred climate substitution. Invalid/missing timezone or coordinates also produces an unavailable state.

MET Locationforecast 2.0 compact is requested server-side with an identifying User-Agent and three decimal places in coordinates. Temperatures summarize available instantaneous samples; wind is the highest available sample. Precipitation amounts sum complete, non-overlapping intervals contained in the requested local date. Cross-midnight intervals are omitted rather than prorated. Covered precipitation hours are shown. Probability is included only when the provider supplies a valid probability and is labeled as the highest interval chance. No feels-like value is invented. Official symbols map to generic Lucide icons. Attribution links MET Norway and CC BY 4.0.

NASA POWER Climatology requests `T2M_MAX_AVG`, `T2M_MIN_AVG`, `PRECTOTCORR` for the AG community. Monthly keys, temperature units, precipitation units and missing-value markers are checked. Typical precipitation is explicitly an average in **mm/day**, not a predicted daily or monthly rainfall total. The provider's climatological period is shown; no sunny/rainy condition or probability is inferred from these averages.

References: [MET usage and caching](https://api.met.no/doc/GettingStarted), [MET terms](https://api.met.no/doc/TermsOfService), [forecast interval semantics](https://api.met.no/doc/ForecastJSON), [NASA Climatology API](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/), [NASA temporal processing](https://power.larc.nasa.gov/docs/methodology/data/processing/).

## Caching and preference

Provider caches are process-local and bounded to 256 entries each, with simultaneous requests coalesced and at most three active requests per provider. MET uses Expires/Cache-Control headers, a one-hour default and the exact returned Last-Modified value for conditional requests. NASA uses a 30-day default; one response supplies all months. Failures cache an unavailable result for five minutes. HTTP 429/503 responses apply provider-wide cooldown and respect a longer Retry-After. No aggressive automatic retries occur.

The UI shares one weather request per saved itinerary revision, bounded to 24 entries with a five-minute lifetime. Scrolling, filtering days, toggling units and opening dialogs do not issue new requests. Reloading may request the private endpoint again; server provider caches still apply.

No suitable existing temperature preference was found. One global localStorage key, `tripnexa.weather.temperature-unit`, persists Celsius/Fahrenheit between trips and browser sessions. The storage event synchronizes other tabs. Storage restrictions fall back to Celsius without blocking weather. All provider temperatures stay Celsius internally, with Fahrenheit converted only for display.

## Desktop, mobile and failure behavior

Trip Weather is one secondary action immediately beside Trip Map in the existing horizontally scrollable day navigation. Each day has a compact, text-labeled weather chip within its existing header, right-aligned where space permits. On mobile it reflows below the heading alongside the existing Map action. No separate weather row was added below day navigation, and screenshot annotations were not reproduced.

The chip opens Day Weather. Trip Weather lists every day and allows opening its details. Both use the existing Radix dialog conventions, neutral surfaces, peach unit selection, Lucide icons, readable text and scoped styles. Unit buttons expose `aria-pressed`; keyboard Enter/Escape and restored focus were verified. A short loading state reserves chip space. Provider failure leaves the itinerary and maps usable and shows Weather unavailable locally.

## Validation actually run

- Weather unit/provider/presentation tests: **12 passed** (`node --test server/tests/weather.test.js`). The successful unit run was part of the initial combined invocation; the API fixture was then corrected and rerun separately.
- Direct HTTP API test: **1 passed** (`node --test server/tests/weather-api.test.js`), using mocked database operations without a real database. Checks anonymous access, ownership, owner-scoped queries, private caching and absence of trip/itinerary/billing writes.
- Targeted TypeScript component contract check using the existing compiler configuration with entry files `Itinerary.jsx`, `ItineraryDay.jsx`, `TripWeather.jsx`: **passed**, including imported dependencies without diagnostic filtering or suppressions.
- **One** `npm run build`: **passed**. Vite reported its existing large-bundle warning.
- Production-build browser verification using `scripts/check-trip-weather-browser.mjs`: **passed** at **1440×1000** and **390×844**, with isolated API fixtures. No page/dialog overflow; checks integrated headers, Forecast/Typical labels, keyboard/focus behavior, C/F reload persistence, day filtering, request deduplication and unavailable-state behavior. No mutations or browser exceptions. Repeated only to settle screenshot animations and confirm dialog bounds.
- Live read-only adapter validation against **both official endpoints** using public Kyoto coordinates: **passed**. MET returned a valid forecast; NASA returned valid monthly average temperatures, mm/day precipitation and its 2001–2020 climate period. This was independent of the browser fixtures.
- No full suite, unrelated billing/affiliate tests, full lint/typecheck sweep, MySQL integration suite, deployment or existing-service restart.

Four browser screenshots use simulated weather, not claims about actual travel-date weather:

- [Desktop day weather](../.local/trip-weather/desktop-day-weather.png)
- [Trip Weather overview](../.local/trip-weather/trip-weather.png)
- [Mobile day weather](../.local/trip-weather/mobile-day-weather.png)
- [Typical weather detail](../.local/trip-weather/typical-weather.png)

The machine-readable browser results are in `.local/trip-weather/report.json`.

## Configuration and limitations

No API keys, paid dependencies, database migration or required external configuration. `MET_WEATHER_USER_AGENT` is an optional non-secret server environment override; the default identifies TripNexa with its website and contact email. Outbound HTTPS access to api.met.no and power.larc.nasa.gov is required.

Monthly climatology is coarse historical information, not a prediction for an exact date. Forecast highs/lows are extrema of available samples, not guaranteed full-day extrema. Today, horizon-edge dates and boundary precipitation intervals may have partial coverage; this is disclosed in the dialog. The existing itinerary has one trip timezone; the weather implementation reuses it and does not infer a different timezone for each city. Missing timezone requires correcting saved trip data through the existing workflow. Weather is not added to public/shared/PDF views. Process-local caches reset when the server process restarts and are not shared across multiple instances. Database integration with real weather-enabled account records was not run; HTTP behavior used database mocks.

Full regression recommended before production deployment.
