# Planner UI refinements and profile photo diagnosis

## Changes

- `src/components/ui/{toast,toaster,use-toast}.jsx`, `src/App.jsx`: repaired the shared notification lifecycle using the already installed Radix Toast primitive. The close button dismisses the correct notification, identical open notifications are deduplicated, and subsequent occurrences can appear again. Distinct errors no longer dismiss one another.
- `src/components/itinerary/SchedulingConflicts.jsx` (new), `src/components/planning/StepFinalize.jsx`: readable amber warning with dark text, wrapping messages and separate alternatives.
- `src/components/itinerary/ItineraryIdentity.jsx` (new), `ItineraryDay.jsx`, `VisitCard.jsx`, `TransportCard.jsx`, `MealDetails.jsx`: consistent data-driven Lucide icons, structured times, compact metadata and a visible meal-options button. Existing callbacks, routing and overnight time labels are preserved.
- `src/components/itinerary/BookingStatus.jsx`, `src/components/planning/StepFinalize.jsx`: structured booking cards, status badges and ticket/booking actions using existing data and destinations.
- `src/components/planning/WizardShell.jsx`, `src/styles/trip-experience.css`: subtle glass Planning Guide, green completion checks, dynamically numbered incomplete steps, peach active state and responsive cards. The active mobile step stays visible after resizing.
- `src/components/profile/AvatarUpload.jsx`: accessible photo selector, file input outside its triggering button, explicit accepted image types, 10 MB validation, retry support, loading/error feedback and preservation of the previous photo on failure.
- `scripts/verify-ux-storage.mjs`: added Chrome regressions for notification dismissal/deduplication, profile photos, completion indicators and responsive itinerary/booking cards.

Completion still comes from the existing `PlanVisits.jsx` state: essential trip details; completed stay details or no-stay selection; pace; mandatory places; accepted AI suggestions; and existing itinerary metadata. An incomplete Stay correctly shows its step number. No completion status was fabricated.

## Profile image diagnosis

The frontend and backend already implement profile images. The existing flow uploads through `POST /api/uploads`, saves the private URL with `PATCH /api/auth/me`, and reads the image through the authenticated upload route. No new storage architecture or backend changes were introduced in this task.

Read-only inspection of the main **local** database found the local storage provider selected, but six existing storage migration columns were absent from `uploads`: `storage_provider`, `storage_key`, `storage_zone`, `storage_region`, `checksum_sha256`, and `asset_kind`. Required billing upload infrastructure, including `billing_operations` and `billing_upload_scopes`, was also absent. These missing migrations block uploads independently of the frontend improvements.

The main local database was not migrated. The existing full migration also includes pending billing initialization affecting existing accounts/trips, so this report does not claim that uploads now work against that unmigrated database. Review and back up the target installation, then apply the existing migration process (`npm.cmd run db:migrate` on Windows) as part of deployment preparation. No new migration is needed for these UI changes.

Production was not accessed; its schema, filesystem permissions and credentials remain unverified. The screenshot's generic error alone does not identify a production storage failure.

### Storage configuration

- Local storage needs no Bunny credential. Keep `STORAGE_PROVIDER=local` (default) and ensure the application's configured `UPLOAD_DIR` is writable by the Node process and persists across releases.
- If choosing Bunny, configure `STORAGE_PROVIDER=bunny`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_REGION`, and `BUNNY_STORAGE_PASSWORD` on the server, or use the existing Admin Storage & CDN settings and managed secret. The password is the Storage Zone password, not the account API key. Managed secrets require the existing `ADMIN_SECRETS_MASTER_KEY`.
- Private profile images use the authenticated application endpoint; `BUNNY_PUBLIC_CDN_BASE` and a public pull zone are not required for private avatars. Do not expose the private zone or credentials to the frontend.

## Verification

- Node 22: lint, typecheck and production build passed. The build retains the existing large JavaScript chunk warning.
- Unit/HTTP tests: 81 passed.
- MySQL integration tests: 55 passed, isolated `tripsync_test` database.
- Focused Chrome suite: 26 checks passed, no failures or unexpected browser errors. Includes desktop/tablet/mobile, ten viewport widths from 320 to 1920 px, real pointer clicks on notification close buttons, recurrence/deduplication, existing-trip Overview navigation and new-trip Update Plan step 1.
- Profile photo: real file selection/upload/private image decoding, URL persistence, refresh and logout/login passed in the migrated test database. Invalid types and oversized files preserve the existing photo.
- Billing Chrome regression: 13 checks passed with synthetic accounts and no real payments.
- Full local Chrome regression: 28 checks passed, including itinerary generation, meal search/save, ticket upload, PDF export, change preview/apply, private sharing, login persistence and admin diagnostics. Provider calls used fixtures.

Browser verification used synthetic trips, provider fixtures and local storage; it does not certify live Bunny, production OAuth or live payments.

Screenshots and focused results: `.local/planner-refinements-final/` (`report.json`, `conflicts-390.png`, `itinerary-cards-390.png`, `booking-cards-1440.png`, `finalize-1440.png`, `profile-avatar.png`).

No deployment, commit, secret changes, production schema changes or removal of existing user data was performed. Other working-tree changes predate this focused task.
