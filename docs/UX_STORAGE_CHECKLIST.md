# Redesign request coverage — local follow-up

This checklist maps the numbered request to the existing implementation and verification. It is not approval to deploy. See [the detailed report](UX_STORAGE_REPORT.md) for file lists, prior test results and architecture.

| Request points | Local implementation / evidence | Remaining limits |
| --- | --- | --- |
| 0–2 | Repository audit, existing architecture and billing preserved; test databases isolated. | No production changes authorized. |
| 3 | Supplied public CDN video is the default; existing Vite override remains. Actual Trips-page playback, seeking, mobile-width playback and unavailable-CDN fallback passed. | Desktop Chrome mobile emulation does not certify Safari/iOS or physical Android devices. |
| 4–8 | Central light tokens, motion/reduced motion, shared header and visual trip cards. | Visual acceptance remains subjective. |
| 9–10 | Existing cards open Overview; new trips open planner step 1. Browser verified. | None identified in these flows. |
| 11–16 | Actual itinerary Place IDs/names, fresh photo metadata, transient decoded images, crossfades and attribution. Missing/slow/invalid photo scenarios tested. Live Colosseum check recorded separately. | Photos load on demand rather than preloading the next slide; previous content remains visible during loading. |
| 17–25 | Shared itinerary/planner styling, children persistence fix, requested controls removed from UI, hidden backend values preserved. | No backend capability removed. |
| 26–27A | Server storage abstraction, dedicated Admin page, encrypted write-only credentials, configuration/version validation, audit and connection test. | Real private Bunny zone and password are still required. |
| 28–32 | Wallet and generated images use private authenticated server access and distinct safe object paths. | HTTP server-mediated upload selected; S3 direct upload and CDN signed URLs are not implemented or required by this architecture. |
| 33–36 | Google photos excluded from storage; additive metadata migration, dry-run/copy utility, retained originals, explicit provider, environment names documented. | No real file transfer or main database migration performed. |
| 37–43 | Slideshow, light trip layout, shared buttons/dialogs and clearer form controls. | No separate permanent Google photo model introduced. |
| 44–45 | Trips, Overview, planner, itinerary, Wallet and creation dialog fit all ten requested widths. | Physical mobile device tests remain outstanding. |
| 46–47 | Billing and Admin preserved; prior billing browser and integration checks passed. | Actual Stripe payments, OAuth and SMTP depend on their separate production setup. |
| 48–50 | Error/fallback behavior tested; video removed from bundle; no new dependencies for the redesign. | Existing Vite large-chunk warning remains. |
| 51–52 | Existing routing, planner, Wallet, sharing, billing and provider scenarios covered by the recorded browser/integration suites. | Fixture coverage is distinguished from live Google/video and untested live private storage. |
| 53–54 | Additive schema exercised on isolated MySQL/MariaDB; unit, integration, build, lint and typecheck results recorded. | Staging migrations and backup verification remain deployment prerequisites. |
| 55–56 | Updated Chrome suite has no uncaught exceptions, unexpected first-party HTTP failures or console warnings; old MP4 absent from bundle. | Deliberately blocked CDN request is an intentional failure test. |
| 57–58 | Mocked Bunny CRUD, authorization, cross-user/trip denial, grants, deletion and failure handling tested. | Live private Bunny CRUD and provider-side privacy need configured credentials. No signed CDN URLs exist to test. |
| 59–60 | Existing server Google integration reused; minimal field mask, server-only key and separate reusable storage/hero components. | Production domain/API restrictions still need staging validation. |
| 61–64 | Shared design primitives, empty/error/loading states, labels, focus styles and reduced-motion behavior. | No exhaustive screen-reader or physical-device accessibility certification; upload status is indeterminate, not a byte percentage. |
| 65–68 | Existing behavior preserved by the recorded regressions and phased implementation; interface follows the requested visual direction. | No claim that all external services are production-ready. |
| 69–70 | Detailed report and prerequisites supplied; stopped short of real private-storage operations without credentials. | No deployment, commit, real `.env` edit or automatic migration of user files. |

## Latest browser run

`MYSQL_TEST_DATABASE=tripsync_test node scripts/verify-ux-storage.mjs --live-intro`

**23 checks passed**, including four new live-video checks inside the application. This run uses real Chrome and MySQL, fixture Google responses, and the real public Bunny video. It does not use a live private Bunny account. ESLint, typecheck and whitespace checks also passed after the test extension; the preceding build already contains the supplied video URL.

Evidence: `.local/ux-verification/report.json`, `intro-live-desktop.png`, `intro-live-mobile.png`, and `intro-unavailable.png`.

## Inputs needed to finish external checks

Configure a dedicated private Storage Zone, its region and Storage API password through **Admin → Storage & CDN**, using the existing server encryption key. Do not use the public video's zone for private Wallet documents without verifying that it has no public access. Test Connection creates and removes a disposable object. Keep the provider local until the connection and privacy checks succeed.

Production-domain checks, physical mobile devices and external payment/auth/email verification require their respective staging environments. These are not replaced by the passing local tests.
