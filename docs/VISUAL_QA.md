# Focused frontend visual QA — 2026-10-02

Presentation-only pass. No routes, data models, upload handlers, accepted file types, API behavior, database code or business rules changed. The cinematic Trips page and existing design remain intact.

## Findings and fixes

- Planner file selector inherited white button text on a light surface. Removed obsolete dark-theme file utilities and added a reusable native `::file-selector-button` pattern: peach background, dark text, rounded border, hover and disabled styling. Browser filenames and file-picker behavior remain native. Default button text contrast is approximately 9.43:1.
- Light-surface keyboard focus used pale peach, making it difficult to see. Existing accent-ink now provides a stronger outline; dark Admin and the photographic hero keep peach focus.
- Legacy planner input borders and placeholders were faint. Added a shared control-border token (approximately 3.22:1 against the beige surface) and explicit muted placeholder color; cards retain their original borders.
- Native Admin date/select controls did not declare the dark color scheme. Added it, along with readable placeholders and native checkbox/radio accents.
- A blanket planner minimum-height rule could stretch checkbox/radio controls. Excluded native inputs and Radix checkbox/radio buttons from that rule.
- Light modal removal/error text was pale red. Reused the darker error color; dark neutral action-button text now stays white. Peach modal buttons retain readable hover text.
- Modal neutral-900 text was incorrectly treated as muted. Restored the existing ink token.
- Image replacement and hero controls could inherit dark text on dark backgrounds. Preserved their white icons, including hero hover.
- Profile-photo upload spinner was hidden inside a hover-only overlay. It is now visible during upload and the camera overlay also appears on keyboard focus.
- Added scroll margins for focused planner/modal controls so browser focus scrolling can account for sticky UI. No header/footer positioning changed.

## Files changed in this pass

| File | Purpose |
| --- | --- |
| `src/components/planning/PrivateFileField.jsx` | Remove conflicting file-button color utilities; keep input and handler unchanged. |
| `src/styles/trip-experience.css` | Shared native upload pattern, light control contrast, focus/error/hover states, control sizing and scroll margins. |
| `src/styles/admin.css` | Native dark controls, placeholders, accent and focus styling. |
| `src/components/profile/AvatarUpload.jsx` | Make existing loading/focus overlay visible. |
| `scripts/verify-ux-storage.mjs` | Assert real Chrome file-button colors, focus, disabled state and unchanged accept list; separate screenshot output. |
| `docs/VISUAL_QA.md` | Findings, scope and verification record. |

## Review and validation

Reviewed shared inputs, textareas, selects, checkboxes/radios, buttons, dialogs/popovers, all file-input call sites, and light/dark page styles. Browser coverage includes Trips, Overview, planner, itinerary, Wallet, profile, authentication, sharing, billing/paywalls and Admin. This is a focused QA pass, not exhaustive WCAG certification or every possible data/state combination.

Commands use Node 22.23.3 and `MYSQL_TEST_DATABASE=tripsync_test` for browser suites:

```text
npm.cmd test
npm.cmd run build
npm.cmd run lint
npm.cmd run typecheck
node scripts/verify-ux-storage.mjs --live-intro
node scripts/verify-billing.mjs
node scripts/final-verification.mjs --local
git -c core.safecrlf=false diff --check
```

Unit/HTTP tests: 81 passed. Visual/UX browser: 27 passed. Billing browser: 13 passed, including actual Wallet file selection/upload and modal focus trapping. Extended frontend journey: 28 passed. Build, lint and typecheck passed; Vite still reports the existing large-chunk warning.

Responsive checks cover the ten existing widths from 320 to 1920 pixels, plus portrait/landscape viewport sizes. No page-level horizontal overflow or new browser exceptions were found in tested flows. Screenshots are under `.local/visual-qa/`, including `stay-helpers-390.png` and `stay-helpers-1440.png`. The first run encountered a Windows error overwriting an earlier screenshot; a separate output folder resolved it.

Tests use synthetic accounts and provider fixtures, with the public intro video loaded from its real CDN. No real user data, paid provider operation, deployment, commit or push was involved. Mobile testing uses Chrome emulation, not physical iOS/Android devices.

One extended journey attempt overlapped a local rebuild and received a temporary missing `dist/index.html` response. Rerunning against the completed build passed all 28 checks. The final CSS-only hero focus-color exception was built after that suite completed; it preserves the existing peach outline on the dark photograph. No application workaround was introduced for the test-environment failure.
