# Full Travel Book map caching — 7 October 2026

## Required predeployment report

1. **Approximate Geoapify credits per newly generated book:** budget about **4–6 credits per uncached day map** at the current 1200 × 440 PNG resolution. A completely uncached three-day book is approximately **12–18 credits**; seven days approximately **28–42 credits**. A book with every day already cached consumes **zero additional Geoapify credits**. Only changed/uncached days cost credits. This is a planning estimate, not measured live billing: [Geoapify documents](https://apidocs.geoapify.com/docs/maps/static/) one request credit plus rendered tile count divided by four. Exact tile count varies. TripNexa's own vector markers add no provider marker costs.
2. **Repeated charges prevented:** successful PNG images are saved persistently and reused across download requests, provider instances and backend restarts. No success TTL or background refresh. In-process request sharing and exclusive disk locks prevent concurrent duplicate generation, including across workers sharing the cache directory. Cached maps also work if the API key is later absent; only new maps require it. A failure starts a persistent five-minute cooldown for that day context and subsequent downloads use the schematic fallback during that cooldown.
3. **Invalidation:** content fingerprint covers owner/trip namespace, day, ordered mapped-stop identities/kinds/numbers and normalized coordinates, active accommodation identity/name/address/coordinates, padded viewport/dimensions, provider, map style, scale, attribution mode and rendering version. Coordinate/order/stop/accommodation/style/version changes select a new cache entry. Old valid entries remain reusable for undo/restore. Notes, ticket changes, weather, download time, API-key rotation, and schedule times do not invalidate unchanged map context. Missing/corrupted files must be regenerated on demand. No itinerary-save hook or page render regenerates maps.
4. **Storage:** default private directory **`C:\travel\.local\pdf-static-maps`**. Layout is `<SHA-256 owner/trip namespace>/<SHA-256 map context>.json`. Each completed record contains base64 PNG bytes and their SHA-256 digest; file names do not expose coordinates or identifiers. Optional backend variable `PDF_STATIC_MAP_CACHE_DIR` changes the root. This is outside `public`, `dist`, and Wallet uploads, with no public cache route. Keep this directory on persistent storage and share it between backend workers to preserve reuse across restarts/redeployments; separate disks cannot share their caches.
5. **Required API-key variable:** **`GEOAPIFY_PDF_MAPS_API_KEY`**, backend environment only. No `VITE_*` key. No account, key or paid subscription was created or assumed. Current local configuration has no key, so live imagery/billing is still unverified.
6. **DB migration:** **none**. This uses private filesystem cache records, not new MySQL tables or changes to Wallet storage.

The [Geoapify Free plan](https://www.geoapify.com/pricing/) allows commercial production within its published 3,000-credit daily quota and attribution requirements. [Static-map storage and reuse](https://www.geoapify.com/static-maps-api/) are permitted without extra reuse charges. No paid-plan assumption, automatic upgrade, or immediate retry was added. Caching reduces consumption; it cannot guarantee the quota if enough distinct maps are generated or other applications use the same account. HTTP/quota failures retain the working schematic PDF. Rate spacing remains four requests/second per Node process; with multiple workers, the Geoapify account's aggregate rate limit must also be considered.

## Execution scope and safety

Only the owned/premium **Full Travel Book** route constructs a scoped map provider. The provider does not create directories, generate imagery, or make requests at construction time: this happens only when a day map is actually requested for an export. Quick PDF, normal itinerary pages, and non-exporting users do not call Geoapify. The web application's interactive map remains Google Maps.

Free-plan credits are always retained: **Powered by Geoapify**, **© OpenStreetMap contributors**, and **© OpenMapTiles** for `osm-bright`. Default attribution inside the image and visible/clickable printed URLs below it remain. Markers/legends/unmapped lists are rendered from the current day; stale PDF labels are never loaded from cache. Existing live Google route link/QR remains, with no invented road geometry.

Cache writes use an atomic temporary-file rename, private permissions, bounded record/image sizes, a digest, and PNG signature/dimension checks. New image generation acquires a writable cache lock first; an inaccessible cache falls back before calling Geoapify. Only successful image responses become image entries. Temporary lock files are released; a lock abandoned after a process crash can be recovered after one minute. Images have no automatic eviction, preserving reuse; back up this private cache if replacing backend disks. Cached images inherit the private saved location content of the trip and must remain private.

## Files changed

- `server/premium-travel/pdf-map-cache.js`: new persistent records, integrity checks, single request coordination, disk locks and failure cooldown.
- `server/premium-travel/static-map-provider.js`: owner/trip scoped cache, style/version identity and on-demand generation.
- `server/premium-travel/pdf-day-map.js`: ordered day context and accommodation fingerprint.
- `server/premium-travel/router.js`: supplies authenticated owner and trip scope only for Full Travel Book.
- `server/config.js`, `.env.example`: private cache directory configuration.
- `server/tests/pdf-map-cache.test.js`: targeted persistent cache behavior.
- `scripts/check-static-map-pdf.mjs`: verifies fresh export instances/repeated PDFs use disk cache.
- `docs/FULL_TRAVEL_BOOK_STATIC_MAPS_REPORT.md`: updated integration status; this report documents caching.

## Validation

- **21 targeted tests passed:** persistence/API-key rotation/absent key; simultaneous downloads; separate backend processes and process restart; coordinates/order/mapped-stop/accommodation/style/version invalidation; unchanged notes/times/weather; owner/trip/day isolation; corrupted image replacement; quota cooldown; unavailable cache; no-coordinate/no-generation cases; existing image/attribution/marker/route protections.
- **Actual PDF validation passed:** two-day, four-page book generated two mocked day-image requests. Fresh PDF export instances and repeated download generated **zero additional successful requests**. Embedded 1200 × 440 image objects, H/numbers, attribution, QR links and unmapped-stop lists were checked. Outage PDF succeeded, and its next export made no repeat failure requests.
- Artifacts: `.local/static-map-pdf/provider-fixture.pdf`, `repeated-download.pdf`, `emergency-fallback.pdf`, `provider-fixture.png`, `report.json`. Imagery is explicitly an offline grid fixture for validation, not the final geographic basemap. No real provider calls or credits consumed by validation.
- One production build: **passed** (`npm.cmd run build`). Vite emitted the existing large-bundle advisory; no errors.
- No full test suite, migration, deployment or backend restart.

Commands: `node --test server/tests/pdf-map-cache.test.js server/tests/static-map-provider.test.js server/tests/pdf-day-map.test.js`; `node scripts/check-static-map-pdf.mjs`; `npm.cmd run build`.

After entering the real key, `node scripts/check-static-map-pdf.mjs --live` validates real imagery and uses a separate validation owner/trip cache namespace. Running it again reuses unchanged day images. Real requests are metered by Geoapify.
