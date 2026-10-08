# Flight upload investigation

## Confirmed code path

1. `src/pages/TravelWallet.jsx` opens `src/components/trip/AddItemModal.jsx` with `presetCategory='flight'`. This is also reached by the Overview Flights shortcut. The booking canvas uses the same Wallet items; there is no separate flight/canvas table.
2. `AddItemModal.upload()` calls `api.wallet.upload(file,tripId)` in `src/api/client.js`: `POST /api/uploads/wallet`, multipart file plus `X-Trip-ID`.
3. `server/uploads.js` calls `saveFile(buffer,ownerId,true,true,tripId)`. The storage adapter writes the bytes. A transaction inserts `uploads` with the authenticated owner, `asset_kind='wallet'`, `wallet_managed=true`, storage metadata and checksum, plus `billing_upload_scopes` (upload/trip/user) and upload accounting. This is **not** a booking transaction.
4. The returned private file URL is staged in the modal's `files` state. The file is not yet linked to a Flight booking.
5. Clicking Save invokes `api.wallet.save`: `POST /api/trips/:tripId/wallet/items` for a new booking or `PATCH .../items/:itemId` for an existing booking.
6. `server/wallet.js:saveWalletItem()` checks trip ownership and transactionally creates/updates `trip_items` (`category='flight'`, `trip_id`, `owner_id`) and `item_attachments` (`item_id`, `upload_id`, `owner_id`). Owned-file checks reject another user's files. Existing upload/item pairs are not attached twice. No new storage PUT occurs during booking save.
7. `GET /api/trips/:tripId/wallet` calls `readWallet()`, reads owner-scoped `trip_items`, and joins `item_attachments` to `uploads` on upload ID and owner. Legacy reservation fields and trip arrival/departure ticket URLs are also projected without copying files.
8. Flights filters `category==='flight'` and sums **attachment counts**, not bookings or storage objects. A manual booking with no attachment can exist while the counter remains zero. Bunny metadata, `asset_kind` and `wallet_managed` are not category filters.

## Reproduction and fix

The existing upload-then-Save flow passed before application changes. Uploading alone correctly produced no booking, but closing the modal silently discarded the staged association. The prior helper copy could also imply that uploading alone completed the operation. This reproduces an uploaded object with no Flight item when Save is skipped; it does **not** prove that the reported production case had the same cause.

Changed only `src/components/trip/AddItemModal.jsx` in application code:

- Explicitly explains the upload and Save steps.
- Shows an uploaded-but-not-yet-saved message alongside the Save action.
- Warns on dismissal with unattached uploads. Cancelling keeps the modal and staged file; Save uses the existing transaction.

No auto-created bookings, duplicate attachment architecture, backend changes, migrations, provider/configuration changes, file moves or file deletions were introduced. Existing production uploads were not modified or recovered speculatively. The existing lifecycle/retention policies were not changed.

## Production evidence still needed

Production API/database/log access was not available during this task. Physical Bunny presence alone cannot establish whether an upload transaction committed or a subsequent booking save was submitted/succeeded. The supplied uploads column list does not establish the state of `trip_items` or `item_attachments`.

If Save was clicked, inspect the status and error body of `POST /api/trips/<trip-id>/wallet/items`. Do not share cookies, authorization headers, credentials or private document content. A successful response should contain a flight item ID and an attachment with the uploaded file URL. Compare with the following owner-authenticated Wallet GET response.

For an operator with read-only database access, this query checks a single known upload UUID without changing anything:

```sql
SELECT u.id AS upload_id, u.owner_id AS upload_owner,
       u.asset_kind, u.wallet_managed, u.storage_provider,
       a.id AS attachment_id, a.owner_id AS attachment_owner,
       i.id AS booking_id, i.category, i.trip_id, i.owner_id AS booking_owner,
       s.trip_id AS upload_scope_trip, s.user_id AS upload_scope_owner
FROM uploads u
LEFT JOIN item_attachments a ON a.upload_id = u.id
LEFT JOIN trip_items i ON i.id = a.item_id
LEFT JOIN billing_upload_scopes s ON s.upload_id = u.id
WHERE u.id = '<the-upload-UUID>';
```

Null attachment/booking fields mean there is no canonical booking association. An absent upload row means the physical object alone is insufficient evidence of a completed application upload. A missing table error requires inspecting the deployment's existing migration state before proposing a repair. Do not automatically associate orphan files: upload scope does not record whether an orphan was intended as a flight, ticket or document.

## Verification

- Existing Wallet/storage MySQL integration tests: 5 passed.
- Unit/HTTP tests: 81 passed. Lint, typecheck and production build passed (existing large-chunk warning).
- Added `scripts/verify-flight-wallet.mjs`: Chrome selects an actual small PNG through the real input; real HTTP and isolated MySQL transactions exercise the Bunny adapter with an in-memory provider transport. Flight, Tickets and Documents each produce one upload, one booking and one association, correct category counts, decoded private image and persistence after reload. Exactly three unique storage PUTs and three bookings are asserted. Unsaved-close warning cancellation preserves the Flight attachment.
- Baseline evidence: `.local/flight-wallet-baseline.log`; final: `.local/flight-wallet-final.log`; screenshots: `.local/flight-wallet/`.
- **Live Bunny was not tested.** The provider transport was simulated; production configuration and existing files were never accessed. A real production end-to-end confirmation remains outstanding, as does identification of the production-specific failure if Save was already completed.

Nothing committed or deployed.
