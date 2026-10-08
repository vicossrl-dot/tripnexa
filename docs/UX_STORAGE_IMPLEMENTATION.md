# TripNexa UX and storage — local implementation in progress

## Initial audit

The live entrypoints are `src/App.jsx`, `Home`, `Dashboard`, `PlanVisits`, `Itinerary` and `TravelWallet`. `TripUI` supplies shared navigation; `TripOverview` is the active overview (the older `DestinationHero` is not its hero). The six-step planner uses a serialized autosave queue. Children disappear because empty age strings are removed by `filter(Boolean)` immediately after adding them.

Existing cards sometimes navigate to itinerary, while newly created trips navigate to Overview; both need the requested routing correction. The old intro video is referenced by Home. No complete public Bunny intro URL was included in the attachment; requested separately.

Private binary reads/writes live in `uploads.js`, cleanup in `file-lifecycle.js`, administrative inventory and exceptional access in `admin/storage.js`. They currently assume local disk. File ownership and billing checks already exist and must remain before content access. Generated images already use `saveImage`. Existing URLs are opaque `/api/uploads/:id` references; retain them across storage providers.

Google photos already use fresh Place Details, expiring owner-bound server tokens, no-store responses and author attribution. Reuse this integration for a transient hero; do not store Google photos or photo resource names in Bunny or SQL.

Configuration already supports versioned validated settings, AES-GCM managed secrets, recent MFA and audit. Bunny must use these facilities. Preserve all pending billing changes. No production deployment, production data access or deploy-script changes are authorized by this task.

Baseline working diff saved in `.local/ux-baseline/before.patch`. Previous billing verification artifacts remain separate. This document is not a completion certificate.
