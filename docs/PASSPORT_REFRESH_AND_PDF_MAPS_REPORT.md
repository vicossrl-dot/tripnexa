# Passport auto-refresh and Full Travel Book maps

Implemented locally on 7 October 2026. No deployment, paid provider activation, new secrets or database schema changes.

## Before You Go

- **Files:** `src/components/trip/PremiumTripFeatures.jsx`; focused browser scenarios in `scripts/check-passport-refresh-and-pdf-maps.mjs`.
- **Trigger:** only an explicit change in the passport selector invokes the shared `refreshEssentials(country)` handler. The bottom button calls that same handler. Opening/restoring/rerendering only reads saved information. Selection persistence remains unchanged. Clearing the country performs a cached read, clears storage and always shows the existing passport-choice message for Entry & documents; it does not initiate a refresh.
- **Duplicates/races:** a synchronous ref locks each active refresh before React rerenders; the selector is disabled during that request. A monotonically increasing request version prevents delayed reads/refreshes from updating a newer context or a closed/replaced panel. Passport selection sends the new country directly, without an extra cached GET. Server context hashes and five-minute cooldown are unchanged.
- **Validation:** all six requested browser behaviors passed: no refresh on open; one Albania POST with immediate busy status; one Moldova POST; delayed initial/Albania reads cannot replace Moldova; reopening restores Moldova without another POST; clearing removes visa text; one existing bottom button remains usable. A simulated same-context 429 preserves the current country and existing error handling. Retrieval, provenance, AI, storage, entitlements and cache strategy were not changed.

## Full Travel Book

1. **Files:** new `server/premium-travel/pdf-day-map.js`; map/QR integration in `server/premium-travel/travel-book.js`; a scoped embedded-image option in `server/itinerary-pdf.js`. Added `server/tests/pdf-day-map.test.js` and `server/tests/pdf-map-fixture.mjs`; updated the existing map assertions in `server/tests/travel-book.test.js`; added the combined validation script and this report.

2. **Root cause:** the original map deliberately had no geographic imagery and independently stretched latitude/longitude into a short white area. Missing-coordinate labels crowded its legend. The old PNG QR also depended on image loading in a renderer that blocked all URLs, including embedded images, and printed before explicitly waiting for decoding.

3. **Selected solution:** the permitted improved schematic fallback plus an explicit server-side provider abstraction. No live basemap provider is enabled. The audit found Google runtime maps and Leaflet dependencies, but no configured non-Google static/print service with approved customer-PDF rights. Leaflet is a display library, not a licensed imagery service.

4. **Provider/license basis:** no commercial service or new terms were accepted. A recommended future option is an owned/static renderer using licensed OpenStreetMap-derived data and independently licensed styles/fonts. [OpenStreetMap's copyright page](https://www.openstreetmap.org/copyright) identifies its ODbL data licence and attribution obligations; [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) governs produced works/data use. [OSMF's printed-map guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines#Books,_magazines,_and_printed_maps) expressly discusses PDFs and requires a printed copyright URL. This is a recommendation for a separately approved renderer, not an activated integration. The [public OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) restricts bulk/offline use; public tiles were not fetched or embedded.

5. **Configuration:** no new key or environment setting is required for the active fallback. A future adapter must be passed explicitly as `basemapProvider`, identify its PDF-use licence basis, confirm customer-PDF permission, provide attribution and return a valid PNG matching the requested Web Mercator viewport. Nothing is fetched unless such an adapter is supplied. No Google imagery adapter is accepted; live Google route links remain. Provider request metadata contains bounds/viewport only, not stop names, trip IDs, booking data or private notes. PNGs at twice the logical dimensions are supported for higher-resolution printing.

6. **Attribution:** the fallback uses no third-party geography and displays its schematic status, without falsely claiming OSM data. A future accepted adapter's attribution appears beneath the map, with its full printable URL. OSM-based adapters also receive `© OpenStreetMap contributors · ODbL` and `https://www.openstreetmap.org/copyright`. This path was tested using synthetic fixture imagery, not actual OSM streets.

7. **Saved coordinates:** a padded, aspect-preserving Mercator viewport fits real saved positions, including dateline handling. H and chronological numbers remain. Coincident H/visit positions receive a combined readable badge anchored to the real point. Missing stops appear in a concise **Not shown on map** list and remain in the timeline; no random coordinates or geocoding are added. Dashed connectors break at missing stops and explicitly indicate order, not road geometry.

8. **QR/printing:** one live-route QR per day is now inline SVG, with a four-module quiet zone, crisp black/white rendering and a 76 px display size. It does not depend on a PNG download/decode and remains scalable. The QR and clickable label stay together. Full Book alone opts into embedded `data:` images and waits for their decoding; external URL schemes remain blocked and its CSP allows only embedded image data. Quick PDF keeps the original default renderer policy/content.

9. **Fallback:** absent, unapproved, Google-labelled, failed, timed-out or mismatched provider output yields a light schematic grid. Map height stays roughly 220–320 px at the intended print width. Full Book export still succeeds. **Real PDF basemap requires a print/PDF-compatible non-Google map provider.**

10. **Validation:** seven focused map tests and two affected existing Full Book/map tests passed; a later provider-permission guard refinement reran only its one affected test. Targeted TypeScript and ESLint for the React component passed. One production build passed (existing large-chunk warning). The combined browser phase validated the passport scenarios at 1440 px with a 390 px layout check, then actual fallback/provider-fixture PDF generation. Only the PDF phase was rerun after finding the embedded-image block and correcting an unmatched fixture route address. The final two-day fallback PDF has **four pages**; actual provider-fixture PNG objects were embedded at 600×220, attribution was visible, mapped/unmapped stops and timeline persisted, inline SVG QR blocks rendered, and clickable Google route annotations remained. No full suite or unrelated tests/builds were run. No paid AI/map calls were made.

Local review artifacts:

- [Map / missing stops / QR example](../.local/passport-and-pdf-maps/pdf-map-example.png)
- [Actual fallback Full Book PDF](../.local/passport-and-pdf-maps/full-book-fallback.pdf)
- [Synthetic provider-interface PDF](../.local/passport-and-pdf-maps/full-book-provider-fixture.pdf)
- [Combined validation results](../.local/passport-and-pdf-maps/report.json)

The screenshot depicts the shared Full Book HTML layout; the PDF links are actual outputs from the production renderer. Fixture imagery does not demonstrate a real licensed street provider. No new basemap service has been configured.
