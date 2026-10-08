# Interactive Trip Maps — implementation report

**6 October 2026. Local implementation only; no deployment, commit, push, production/staging database update, service restart or real browser credential.** Existing unrelated changes are preserved. The feature is additive to the private itinerary page. All local database validation uses `tripsync_test`.

The complete UI and Google Maps adapter are implemented. **Live Google rendering requires the separate restricted browser key described in [configuration instructions](INTERACTIVE_TRIP_MAPS.md).** Browser screenshots use a clearly labeled SDK fixture; they do not claim live Google tiles, authorization or API billing verification.

## 1. Existing files changed

```text
.env.example
package.json
scripts/smoke-browser.mjs
server/trips.js
server/billing/entitlements.js
src/api/client.js
src/pages/Itinerary.jsx
src/components/itinerary/ItineraryDay.jsx
src/components/billing/Billing.jsx
```

The changes add one optional example variable, one integration-test command, one protected configuration endpoint and API client method, the map provider around the existing itinerary content, right-rail/day/Trip Map actions, item selection hooks, a feature label and accurate premium/free feature copy. The full smoke harness is aligned with the already-existing direct-to-wizard creation, overview scenery and Home → Overview → Itinerary navigation; its persistence, editing, sharing and reload assertions remain. Prices, quotas, credit consumption, cancellation and Stripe logic are unchanged. Several of these files were already dirty before this task.

## 2. New files

```text
server/interactive-maps.js
src/lib/interactive-trip-map.js
src/lib/google-trip-map.js
src/components/itinerary/InteractiveTripMaps.jsx
src/components/itinerary/TripMapCanvas.jsx
src/styles/interactive-trip-maps.css
server/tests/interactive-maps.test.js
server/tests/interactive-maps-fixture.mjs
server/tests/interactive-maps-integration.mjs
scripts/interactive-map-provider-fixture.mjs
scripts/interactive-maps-browser.mjs
docs/INTERACTIVE_TRIP_MAPS.md
docs/INTERACTIVE_TRIP_MAPS_REPORT.md
```

Generated build/log/screenshot artifacts remain in ignored `dist/` and `.local/interactive-maps/`. This manifest describes this feature, not the entire pre-existing dirty working tree.

## 3. Database migration

**None.** The map uses the existing trip, displayed itinerary items, selected places, saved restaurant choices and owned Wallet stay records. There is no duplicate itinerary, route store, persistent map metadata or background geocoding job. Existing migrations are exercised only by the test harness in the separate test database.

## 4. Provider and infrastructure

Google Maps JavaScript API, quarterly channel, lazy asynchronous script loading, custom accessible `OverlayView` marker buttons and Google's own basemap/attribution. No new runtime npm package was added; the installed React Leaflet package remains unused. Google Places data shown on a map requires a Google Map, so switching those coordinates to another provider was avoided. [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

The provider boundary is `google-trip-map.js`; the React canvas manages lifecycle, ready/error state and selection. It makes no Places, Routes, Directions or geocoding call. Existing server provider credentials never fall back into the browser configuration. The authenticated endpoint checks ownership even when billing enforcement is paused.

## 5. Day Map

An explicit **Open Day Map** action keeps the SDK unloaded for travelers who do not use maps. Once opened, the panel shows the current day's saved stops, hotel markers, numbered visits/restaurants/endpoints and transfer list. Counts and travel minutes derive from the same displayed items. The day changes with scrolling; an explicit itinerary day filter takes precedence. Expand opens the larger dialog. Closing the map disposes its SDK instance.

Markers select the corresponding timeline article; on desktop they scroll/focus it with reduced-motion support. Clicking/focusing a mapped article selects the matching marker and compact stop card. Both marker and list expose pressed states; the timeline has an outline and the selected list row explicitly says Selected. A transport with two endpoints preserves the endpoint the traveler selected.

## 6. Trip Map

The secondary **Trip Map** action sits with the existing day selectors. Its dialog has horizontally scrollable **All / Day 1 / Day 2 / …** controls. All groups the stop list by day and uses a restrained five-color sequence with explicit day labels, so color is not the sole identifier. It suppresses transfer rows/lines until a day is selected. Coincident locations are grouped into a `+` marker; repeated activation cycles their stops. Individual day views retain chronological markers and the saved transfer links. No routes are drawn where no route geometry exists.

## 7. Desktop behavior

At widths of 1024 px or more, the map uses the existing **240 px right rail**, below On the go, Routes & maps and Tickets & bookings. Timeline width, cards, spacing and navigation remain intact. While the map is closed, the rail retains its original sticky behavior. Once opened, the map itself is sticky; a `ResizeObserver` measures the existing navigation height for the correct offset. Its maximum height respects the viewport and its compact list scrolls internally. Existing rail disclosure cards remain accessible above it.

The All-days observer uses existing day sections, a reading line 70 px below the navigation and a requestAnimationFrame-throttled scroll calculation. A later day becomes active only when its header passes that line. There is no navigation change, timeline rerender from a new schedule, or page scroll triggered merely by changing the active map day.

## 8. Mobile and tablet behavior

Below 1024 px the persistent rail map is hidden; each day header has a compact Map action. The existing Radix dialog provides focus containment, Escape/close and backdrop behavior. At widths below 768 px it fills the viewport with the map above a scrolling stop list; larger tablet widths use a spacious dialog. The opening scroll coordinates and focused control are saved; closing restores both without scrolling the timeline to the selected marker. Selecting a marker inside the dialog updates the compact stop list instead.

Only one canvas is mounted: opening a dialog suspends the rail canvas, and hidden/offscreen rail content does not initialize a map. There is never one SDK instance per itinerary day.

## 9. Premium gating

Uses the existing trip billing endpoint, `tripAccess`, `requireFeature` and `BillingPaywall`. The new feature code is `interactive_trip_maps`. Free users see a locked presentation and **Upgrade to unlock**; no provider configuration or SDK is loaded. The normal paywall supports Pro and existing trip-credit activation. A successful `billing-unlocked` event and return-to-window refresh access.

Existing active trip entitlements from Trip Packs, subscription creation, grants and grandfathering keep the established durability rules. Existing temporary access to a Free trip while subscribed follows the current billing helper. Expired/revoked entitlements and the enforcement pause also retain current behavior. Viewing maps never consumes a credit or allowance. Existing Free Google Maps route links remain available.

## 10. Derivation from itinerary data

The map projects the exact array passed to the timeline, filtering by the same calendar date and retaining its order. It does not use an independently sorted route or optimize, regenerate or write anything. Item IDs connect markers to articles but are never sent to a public itinerary surface.

Coordinates are validated for finite values and latitude/longitude range. Null/blank coordinates do not become zero. Saved item coordinates take precedence; compatible selections can supply missing coordinates. Exact, unambiguous address/name matches resolve saved transfer endpoints, including dated stays and arrival/departure locations. Ambiguous or changed selection locations remain unresolved. Accommodation/start/end is only added where the saved transfer actually refers to it; no automatic return is invented. Real restaurant choices use their own coordinates, never the search anchor. Generic meal breaks and free/buffer time create no fictitious place.

Unknown coordinates retain their ordinal and compact list entry. Day labels use the existing calendar-date formatter, independent of browser timezone conversion. Existing walk/transit/taxi/car modes receive labels/icons; unknown modes are labeled Transfer. The existing `buildMapsLink` remains unchanged.

## 11. Fallbacks

Absent browser configuration, no valid coordinates, script/network/authentication failure or a canvas render error produce **“Map preview isn't available for this part of the trip.”** The stop list and available route links remain useful. An access-check failure has a separate Retry action and does not assume Free or premium. No map error blocks the itinerary, opens a new booking, changes saved times or removes the existing route links.

## 12. Tests added

Nine unit tests cover array ordering/immutability, hotel/transfer sequencing, marker numbering, generic versus selected meals, coordinate validation, ambiguous/stale locations, visible-day threshold, coincident-location grouping, long names and 12-day/many-stop/calendar behavior.

The real MySQL/HTTP suite has seven scenarios plus its parent (eight tests): anonymous/foreign ownership denial; Free paywall with unchanged basic itinerary access; premium trip on a Free account without credit use; API order and a saved edit feeding the map; missing-key allowlist response; expired grant and billing-enforcement pause behavior; the existing Google provider disable switch.

The browser suite uses real sessions/APIs/entitlements and a controlled Google SDK contract fixture. It checks all nine requested widths, lazy loading, sticky offset and rail position, mouse/keyboard marker synchronization, scrolling day changes, day filters, 12-day overview, mixed modes, one-stop/many-stop/missing-coordinate days, long text, mobile scroll/focus restoration, Free paywall handoff, provider error, unchanged route URLs and horizontal overflow. Targeted axe checks cover the map dialog. Fixture labels remain visible in screenshots.

## 13. Existing tests and validation results

The original baseline was 99 passing unit tests and a clean typecheck. Validation uses Node **22.23.3**, real local MySQL in `tripsync_test` and Chrome **154.0.8037.93**. External provider behavior is controlled by local fixtures; no live Stripe payment, Google charge or AI request is claimed.

| Check | Final result |
| --- | --- |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd test` | 108 passed; zero failed/skipped |
| `npm.cmd run test:integration` | 37 passed; zero failed/skipped |
| `npm.cmd run test:billing` | 22 passed; zero failed/skipped |
| `npm.cmd run test:public` | 14 passed; zero failed/skipped |
| `node --test server/tests/storage-integration.mjs` | 1 passed; zero failed/skipped |
| `npm.cmd run test:maps` | 8 passed; zero failed/skipped |
| `npm.cmd run build` | Exit 0; existing large-chunk warning |
| `node scripts/final-verification.mjs --local` | 28 browser checks passed; zero failures |
| `node scripts/smoke-browser.mjs --full --mock-providers` | Exit 0; full wizard autosave/reload and itinerary regression passed |
| `node scripts/interactive-maps-browser.mjs` | 48 checks passed; zero failures or unhandled errors; 23 screenshots |

The Node/MySQL suites total **190 passing tests**, with none failed or skipped. The existing browser checks exercise generation, changes, repair/undo, dates and places, booking targets, unaffected-day persistence, routing, private Wallet uploads, QR/PDF access, PDF generation, anonymous sharing without private files, account navigation and Admin MFA. The full smoke test deliberately injects temporary provider failures to verify retry behavior; those expected fixture messages are retained in its successful log.

The final maps run covers **1920, 1440, 1280, 1024, 768, 430, 390, 375 and 360 px**. It confirms the original rail stays sticky before opening a map, the opened Day Map sticks independently, scroll changes the contextual day, mouse/keyboard selection synchronizes, All/Day filtering works, and modal close restores the exact scroll position and focus. It checks one-day and 12-day trips, 18-stop days, missing coordinates, no accommodation/return, existing route URLs, premium/Free access and provider failure. Date labels remain correct in Europe/Bucharest, Pacific/Honolulu and Pacific/Kiritimati. Targeted axe WCAG A/AA checks on desktop/mobile map dialogs report zero violations; this is not a full application or live Google accessibility certification.

The full smoke harness contained stale expectations for existing UI that predates this feature: new trips now open the planning wizard directly, overview scenery replaced the old train SVG, Home opens the trip overview before the itinerary, and visible wizard controls expose `data-plan-step`. Only these navigation/selector assertions were aligned with the current interface; the persistence, editing, retry, sharing and autosave/reload assertions remain. No unrelated product screen was changed to accommodate a test.

Initial legacy Chrome DevTools runs timed out at `Page.enable` inside the execution sandbox. Approved runs outside that restriction completed successfully. The initial failures remain in `app-browser-sandbox-failure.json` and `smoke-sandbox-failure.log`, alongside the stale-selector run logs; they were not silently skipped. Final evidence is under `.local/interactive-maps/`, including `final-test*.log`, `final-storage.log`, `final-app-browser.log`, `final-smoke.log`, `app-browser-report.json` and `check-results.json`.

## 14. Production build and performance

The production Vite build passed and generates the map canvas/provider as a separate lazy chunk: **4.91 kB raw / 2.22 kB gzip**, using Vite's reported decimal units. The SDK and provider configuration are not requested before opening a map. One Google script promise is reused on the page. Marker/day changes reuse the current map instance; dialog/rail transitions dispose the previous instance. Google usage, SDK payload and basemap rendering are external and require the configured browser key. Fixture scripts and their test key are absent from `dist`.

The existing root bundle remains above Vite's 500 kB warning threshold; the warning is retained and the build exits successfully. No unrelated bundle refactor or warning suppression was introduced. The build output is local only.

## 15. Remaining limitations

- No real Google browser key is configured by this task. Live tiles, referrer authorization, provider keyboard/zoom behavior and cloud billing cannot be claimed from the SDK fixture.
- Saved transfers have no road geometry; ordered stop markers and existing transfer links are intentional. Exact road lines would require a separately designed addition to the existing routing pipeline.
- Missing coordinates are not silently purchased from a geocoding API. Travelers can resolve places through the existing planning controls and refresh the itinerary.
- The automated browser device sizes are desktop engine emulations, not a physical-device or full screen-reader audit. Third-party Google map accessibility requires a configured live-provider review; the application's parallel stop list stays keyboard accessible.
- Opening Google Maps loads a third-party service and follows Google's normal usage/attribution requirements. Existing business/legal drafts still require the owner's verified information.

## 16. External API/key requirement

The only new setting is the empty `GOOGLE_MAPS_BROWSER_KEY` variable. It must be a dedicated HTTP-referrer-restricted **Maps JavaScript API** browser key, with a separately restricted development key for local origins. No server Places key, production key or new secret was copied into frontend code. Exact Cloud restriction examples, environment location, local activation and troubleshooting are in [INTERACTIVE_TRIP_MAPS.md](INTERACTIVE_TRIP_MAPS.md).

## 17. Screenshots and browser evidence

The responsive suite produces **23 screenshots** across 1920, 1440, 1280, 1024, 768, 430, 390, 375 and 360 px. Every basemap preview capture is explicitly labeled as a provider fixture; no illustrative grid is represented as live geographic data.

| Requested evidence | Capture |
| --- | --- |
| Desktop Day Map, paid unlocked | [1440 px sticky Day Map](../.local/interactive-maps/browser/1440-desktop-day-map.png) |
| Desktop Trip Map, All | [All days and grouped locations](../.local/interactive-maps/browser/1440-trip-map-all.png) |
| Desktop Trip Map, selected day | [Saved stops and transfer links](../.local/interactive-maps/browser/1440-trip-map.png) |
| Mobile Day Map, paid unlocked | [390 px Day Map](../.local/interactive-maps/browser/390-mobile-day-map.png) |
| Mobile Trip Map | [390 px selected day](../.local/interactive-maps/browser/390-trip-map.png) |
| Free locked state | [Desktop](../.local/interactive-maps/browser/1440-free-locked.png), [mobile](../.local/interactive-maps/browser/390-free-locked.png) |
| Provider failure with retained route links | [390 px error state](../.local/interactive-maps/browser/390-provider-error.png) |
| Narrowest requested width | [360 px Day Map](../.local/interactive-maps/browser/360-mobile-day-map.png) |

Raw browser evidence: [report.json](../.local/interactive-maps/browser/report.json). The captures were visually reviewed in addition to automated checks. Earlier raw runs are retained: they exposed a global button active-transform collision, the default dialog width overriding the map width, indistinguishable labels for two visits to the same hotel, and the test harness exceeding the existing API rate window. Scoped styles, time-bearing marker labels, grouped-marker keyboard checks and paced test navigation address those findings without relaxing the API limit.

The preceding, separate homepage image regression is complete and documented in [the website image report](../website/docs/HOMEPAGE_IMAGE_REGRESSION.md). This maps work does not modify marketing pages or their assets.
