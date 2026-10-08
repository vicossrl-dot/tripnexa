# Full Travel Book: geographic static maps

## Provider research and decision

Selected **Geoapify Static Maps API**, using the `osm-bright` street-map style. The research findings were reported in the conversation before implementing the provider.

| Requirement | Finding |
| --- | --- |
| Commercial PDF/print | The [Static Maps product FAQ](https://www.geoapify.com/static-maps-api/) explicitly permits printed maps in commercial products without additional reuse fees. It also permits storing and redistributing static map images. Embedding that image in a downloadable PDF uses these permissions; the FAQ does not specifically name TripNexa or PDF files. |
| Free tier / pricing | [Published pricing](https://www.geoapify.com/pricing/): Free includes 3,000 credits/day and up to 5 requests/second, no credit card, commercial production allowed within limits and with attribution. API 10: USD 59/month before tax, 10,000 credits/day. Pricing checked during this implementation. |
| API key | Required. Create an account and project at [Geoapify MyProjects](https://myprojects.geoapify.com/), then open the project's **API Keys** section. |
| Attribution | [Static Maps attribution requirements](https://apidocs.geoapify.com/docs/maps/static/): Powered by Geoapify on Free, © OpenStreetMap contributors, and © OpenMapTiles for `osm-bright`. All remain visible, with clickable and printed URLs below each PDF map. Default attribution inside the provider image is retained. |
| Implementation size | One backend adapter, built-in Node fetch, no new dependencies, browser mapping SDK, tile scraping, or self-hosted rendering service. |

The [terms](https://www.geoapify.com/terms-and-conditions/) also require attribution and compliance with plan limits; their general wording mentions limitations for Free production use. The more specific current pricing FAQ describes commercial production within quota. The implementation retains all credits and does not bypass quotas.

[Static-map credit costs](https://apidocs.geoapify.com/docs/maps/static/) include the request plus rendered tiles; a static image is **not necessarily one credit**. Provider-rendered markers cost extra. TripNexa overlays its own vector markers, so no marker-generation requests are made.

## Implementation

- `server/premium-travel/static-map-provider.js`: fixed HTTPS Geoapify endpoint, server-only key, street-map PNG at 1200 × 440 for a 600 × 220 logical viewport. Sends the padded geographic bounds, without provider-specific zoom assumptions. No names, booking data, passport details, route geometry, or Google content are sent.
- `server/premium-travel/router.js`: connects the configured provider only to the existing authenticated/premium Full Travel Book route. Ownership checks, Wallet/affiliate reads, and Quick PDF remain unchanged.
- `server/config.js` and `.env.example`: add `GEOAPIFY_PDF_MAPS_API_KEY`.
- `server/premium-travel/travel-book.js` and `pdf-day-map.js`: sequential day-map requests, padded saved-coordinate bounds, H for active saved accommodation even without a hotel transfer, original itinerary numbers, and TripNexa vector markers. Geographic maps do not draw guessed route lines. Existing Google live route link/QR and unmapped-stop list remain.
- `server/tests/static-map-provider.test.js`, `pdf-map-fixture.mjs`, and `scripts/check-static-map-pdf.mjs`: targeted provider and real PDF embedding validation.

**Caching follow-up:** map contexts now reuse persistent private records across downloads and restarts, with no success TTL. See the [cache and cost report](FULL_TRAVEL_BOOK_MAP_CACHE_REPORT.md) for invalidation, concurrency protection and storage. Requests are spaced at least 250 ms apart across exports in this Node process. A five-second deadline, HTTP/quota failures, cancellation, invalid PNG, wrong dimensions, or oversized response retain the existing emergency schematic; failed contexts have a five-minute cooldown. Missing configuration uses an existing cached map where available, otherwise the fallback. Days with no valid coordinates do not request imagery. Rate spacing is per process; multiple production workers must consider account-level aggregate rate limits.

Only decoded PNG data is embedded; the key and external request URL are not emitted into HTML/PDF. Responses are limited to 5 MiB, exact expected dimensions, and PNG format; redirects are rejected. The PDF renderer uses the existing isolated Chrome rendering path with network access blocked.

## Required configuration — not completed automatically

1. Register at [Geoapify MyProjects](https://myprojects.geoapify.com/).
2. Create a project such as **TripNexa PDF Maps**. Free is sufficient while its published quota meets usage.
3. Open **API Keys** and copy the project key. For server requests, use allowed backend outbound IP restrictions where available, rather than browser referrer restrictions.
4. Set `GEOAPIFY_PDF_MAPS_API_KEY=<your actual project key>` in the private backend environment (`C:\travel\.env` for local development). Do not use `VITE_*` or commit the key.
5. Restart the local backend when ready, then generate Full Travel Book. No deployment or backend restart was performed here.

No account or credentials were invented. **The current environment has no configured key.** The actual geographic basemap appearance and provider's live bounds alignment still need validation after configuring it. The implementation is ready to request real streets, neighborhoods, parks and water available in Geoapify's map data; the schematic is not the intended final map.

## Validation

- Targeted map/provider tests: **13 passed**. Includes padded/dateline coordinates, H/numbered markers, missing-coordinate stops, attribution, exact request bounds, request deduplication, absent key, HTTP 429/outage, cancellation and invalid/oversized/wrong-sized images.
- Isolated PDF validation: **passed**. Two-day, four-page Full Travel Book embeds actual 1200 × 440 PNG image objects; marker/attribution/QR DOM visibility checked in Chrome. Emergency service-failure PDF generated successfully. No database queries or external API requests.
- The offline PNG fixture is a grid used to test image embedding; it is explicitly **test data, not a proposed geographic basemap**. Artifacts: `.local/static-map-pdf/provider-fixture.pdf`, `provider-fixture.png`, `emergency-fallback.pdf`, `report.json`.
- One production build: **passed** (`npm.cmd run build`). Vite reported the existing large-bundle advisory; no build errors.
- No full test suite, deployment, credential changes, migrations, or account registration.

After configuring a key, run `node scripts/check-static-map-pdf.mjs --live` for a real-provider sample PDF and screenshot in `.local/static-map-pdf/geographic-live.*`. This explicitly makes a metered Geoapify request; the default command uses mocked responses only.
