# Interactive Trip Maps — configuration and maintenance

Implemented locally on 6 October 2026. No deployment, production/staging change, real browser key or new database migration is part of this work. See [implementation and validation report](INTERACTIVE_TRIP_MAPS_REPORT.md).

## Provider and credentials

The private itinerary already contains Google Places coordinates and Google route links. The map uses **Google Maps JavaScript API**, loaded only after an eligible traveler opens a map. It does not make Places, Directions, Routes or geocoding calls, and does not calculate a second itinerary. Google requires Places results displayed on a map to use a Google Map. The preinstalled, unused React Leaflet package is therefore not used for this feature. [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

The existing server credential `GOOGLE_MAPS_API_KEY` is **not** sent to the client. The new, optional variable is:

```dotenv
GOOGLE_MAPS_BROWSER_KEY=
```

This is a dedicated **public browser credential**, not a server secret. It necessarily appears in the browser request to Google. Its protection is the restrictions applied in Google Cloud. Keep it separate from the server Places/Routes key. No real value was added to `.env`, source, documentation or fixtures. `.env.example` contains only the empty variable.

## Exact setup for a future authorized activation

1. In the intended Google Cloud project, enable **Maps JavaScript API** and its required billing. Map loads can incur Google charges; this feature does not enable an API or change cloud billing itself. Use the existing Cloud usage/quota monitoring appropriate for the project. [Maps JavaScript setup](https://developers.google.com/maps/documentation/javascript/get-api-key).
2. Create a separate API key for the web map. Set **Application restrictions → Websites (HTTP referrers)**. Allow only the actual application origins where this private itinerary runs. For the documented production app this is `https://my.tripnexa.app/*`. Include the corresponding origin entry `https://my.tripnexa.app` if the Cloud form requires it for origin-only referrers. Do not grant every subdomain or the unrelated marketing domain by default.
3. Set **API restrictions → Restrict key → Maps JavaScript API** only. The browser implementation does not need Places API, Routes API, Geocoding API or any other Google API on this key.
4. Use a separate restricted development key for local review. Allow the exact scheme, host and port actually used, for example `http://127.0.0.1:5173/*` and its origin, or `http://localhost:5173/*` and its origin if that is your chosen URL. For a local production server, authorize its actual port instead. Do not add localhost to the production key. A browser origin and port are significant; `localhost` and `127.0.0.1` are different hosts. Do not use `file://` for this review. [Google key restriction guidance](https://developers.google.com/maps/api-security-best-practices).
5. Set `GOOGLE_MAPS_BROWSER_KEY` in the **Express server environment**. No `VITE_` variable, frontend source edit, npm install or frontend rebuild is needed merely to change this runtime value. Restart only the authorized local server for local review. Production service changes remain a separate release action.
6. Ensure the existing Google provider switch in Admin is enabled; map configuration respects `google_enabled`. Refresh the app, open an owned premium trip and choose **Open Day Map**, **Map** or **Trip Map**. The authenticated `/api/trips/:id/interactive-map` response should say `configured: true`; do not copy its key into logs. Google should load once on the page and show its own basemap/attribution. Check zoom/pan, marker buttons, the compact ordered list and a mobile close/reopen. Verify a Free trip remains locked and retains its existing route links.
7. If Google rejects the domain/API/key/billing, the map fails safely and preserves the stop list and existing links. Inspect the local browser's Maps error code and the Cloud restrictions; do not remove all restrictions to make a test pass. [Google error codes](https://developers.google.com/maps/documentation/javascript/error-messages).

The app already sends `Referrer-Policy: strict-origin-when-cross-origin`; it is retained. Future hosts that add a CSP must permit Google's documented Maps resources without stripping Google attribution. No hosting/CSP configuration was changed here. Google Maps use should be covered by the app's published Terms/Privacy; the existing legal drafts still require owner review. [Maps JavaScript policies](https://developers.google.com/maps/documentation/javascript/policies).

## Data and access

`src/lib/interactive-trip-map.js` projects the **currently displayed** `items` array. It never sorts it, changes dates, updates rows, geocodes missing locations or invokes generation. Day labels use the existing date presentation helper. Coordinates come from saved itinerary items, selected restaurants, exact matching selection records or unambiguous saved route endpoints/stays. An accommodation is included only when an actual transfer refers to it. Generic meals, buffers and free time do not invent location markers. Missing coordinates remain visible in the ordered list, preserving numbering.

Saved transfers currently contain origin, destination, mode and duration but **no persisted road geometry**. The UI displays mode labels/icons and the unchanged Google Maps URL builder. It does not connect stops with invented roads or straight-line routes. All mode groups stops by day and suppresses transfer rows; selecting a day reveals its ordered transfer links. Repeated colors on long trips are accompanied by explicit day headings and accessible day labels.

Access uses the existing `/api/billing/trips/:id`, `tripAccess` and `requireFeature`. The provider configuration endpoint independently checks ownership and `interactive_trip_maps` access. Existing credit, subscription-created and grandfathered entitlements retain their established durability; the existing enforcement pause still applies. Free locked UI invokes `billing-required`, and successful credit activation refreshes via `billing-unlocked`. Existing itinerary coordinates/Google links remain available to Free users as before; this is a premium UI/configuration gate, not a claim that those existing coordinates became secret.

## Local validation

Use Node 22 as required by the root project. MySQL integration/browser scripts require `MYSQL_TEST_DATABASE` ending in `_test`; never point them at the normal application database.

```powershell
$env:MYSQL_TEST_DATABASE = 'tripsync_test'
npm.cmd test
npm.cmd run test:maps
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
node scripts/interactive-maps-browser.mjs
```

The browser script reuses the existing website Playwright installation (`website/node_modules/@playwright/test`) and installed Chrome. It uses real local MySQL, sessions, itinerary APIs and entitlement checks. Only Google SDK rendering is intercepted with `scripts/interactive-map-provider-fixture.mjs`; no paid calls or real browser key are used. Its neutral grid is explicitly labeled **Map provider fixture · no live tiles**. This validates our UI, adapter contract and responsive behavior; it does not verify live Google authorization, tiles, provider controls or billing.

The test fixtures clean up their own accounts and restore the temporary billing/provider settings. Run MySQL suites sequentially because existing suites also temporarily modify global settings. Evidence and screenshots are under `.local/interactive-maps/`; these are ignored local artifacts and are not served to users. No test hook or fixture provider is imported by runtime application code.
