# Trips page restoration — 2026-10-02

Restored the cinematic Trips presentation from Git. `git log -- src/pages/Home.jsx` identifies `7fdb6f9` as the last committed Home change; the committed Home/folder components were used as the source, not reconstructed from a screenshot. The pre-restoration working versions are backed up under `.local/restoration-baseline/`.

## Scope and behavior

The page again has a full-viewport video with the original overlays, top-left logo, Admin/account controls, “Your Trips / Where to next?” heading, original subtitle, horizontal folder cards, dates, statuses, passport stamps and New Trip card. Existing data still comes from the same owner-scoped APIs. Current cards continue opening Overview; New Trip still opens planner step 1. Login and Home continue showing the dashboard rather than restoring the older automatic last-trip redirect. The original clickable airplane-window transition remains available.

Video loads directly from `https://fast-imgs.b-cdn.net/tripnexa.mp4` through the existing shared constant. No video was downloaded, copied into application assets or proxied. The original `ScrollVideo` sequence plays through to a clickable still frame; it did not use HTML `loop`, so that sequence was preserved. Added a poster and existing-still fallback for failed loading/autoplay. Restored API error/retry handling from the current page.

Helpers describe the actual capabilities: hotel links and confirmations have explicit extraction/review actions; planner arrival/departure uploads only store the document. Wallet extraction is offered only when its existing capability/category checks allow it. General document helpers promise organization, not automatic extraction. No parser, entitlement or API behavior changed.

## Files changed by this restoration

| File | Reason |
| --- | --- |
| `src/pages/Home.jsx` | Restore committed cinematic structure; reuse CDN constant and preserve current dashboard routing and retry handling. |
| `src/components/home/TripBagCard.jsx` | Restore original folder appearance, metadata, stamps and context menu; retain Overview destination. |
| `src/components/home/NewTripCard.jsx` | Restore original compact card; provide an accessible New Trip label. |
| `src/components/home/ScrollVideo.jsx` | Keep original sequence; show poster/still on load or autoplay failure. |
| `src/components/ui/field-helper.jsx` | New compact reusable icon/text helper. |
| `src/components/planning/PrivateFileField.jsx` | Add accurate upload-only helper with optional contextual copy. |
| `src/components/planning/StepStay.jsx` | Add contextual link/confirmation helpers tied to existing extraction capability. |
| `src/components/trip/LinkAutoFill.jsx` | Explain available-detail extraction and review without promising private booking access. |
| `src/components/trip/AddItemModal.jsx` | Add capability-aware ticket/booking/document helper. |
| `scripts/verify-ux-storage.mjs` | Adapt tests to restored DOM; add folder, navigation, helper and six-viewport checks; save separate restoration evidence. |
| `docs/TRIPS_RESTORATION.md` | This report. |

Other pending working-tree changes belong to earlier work. This task did not edit backend/database files, routes, authentication, payment/subscription logic, Google Places, storage adapters, package files, `.env`, deployment scripts or the separate redesign styles. No production deployment or Git commit occurred.

## Verification

Commands used Node **22.23.3** from `.local/node22/node-v22.23.3-win-x64`, with that directory prepended to PATH for npm. Database/browser commands used `$env:MYSQL_TEST_DATABASE='tripsync_test'`.

```powershell
npm.cmd test
node --test --test-concurrency=1 server/tests/*-integration.mjs server/tests/integration.mjs
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
node scripts/verify-ux-storage.mjs --live-intro
node scripts/verify-billing.mjs
node scripts/final-verification.mjs --local
git -c core.safecrlf=false diff --check
```

- Unit/HTTP: **81 passed**; complete MySQL integration selection: **55 passed**.
- Restoration/UX browser: **26 checks passed**; billing browser: **13 passed**; extended local browser journey: **28 passed**.
- Production build, ESLint and TypeScript pass. Existing Vite warning for chunks over 500 kB remains.
- Browser verified direct CDN source, real playback, seeking, inline/muted autoplay, unavailable-CDN fallback, New Trip, existing trip opening, logo/Trips navigation, helper copy, and no unexpected exceptions/first-party failures/console warnings. The blocked-CDN scenario intentionally produces a failed media request.
- Visual review: **1920×1080, 1440×900, 1366×768, 820×1180, 390×844, 844×390**. Fullscreen video uses `object-fit: cover`; folders scroll within their row without page-level horizontal overflow. Existing ten-width regression also passed.
- Six synthetic named trips exercise names, destinations, dates and status rendering. Production accounts were not read or modified. These screenshots are test fixtures, not proof of the contents of a real account.
- Mobile tests use Chrome viewport emulation; physical iOS/Android autoplay behavior is not certified.
- No local MP4 remains in `public`; the old MP4 filename is absent from the built output.

Evidence is in `.local/restoration-verification/`: `report.json`, `restored-trips-1920x1080.png`, `restored-trips-1440x900.png`, `restored-trips-1366x768.png`, `restored-trips-820x1180.png`, `restored-trips-390x844.png`, `restored-trips-844x390.png`, `intro-live-desktop.png`, `intro-unavailable.png`, and `stay-helpers-390.png`. Unit/integration logs are in `.local/restoration-baseline/`. Billing and extended journey reports retain their existing output directories.
