# Bunny storage and public media

Implementation is local. No production migration, file transfer or deployment has been performed.

## Configuration

| Variable | Exposure | Purpose |
| --- | --- | --- |
| `STORAGE_PROVIDER` | Server | Explicit `local` or `bunny`; existing installations default to local. |
| `BUNNY_STORAGE_ZONE` | Server | Dedicated private Storage Zone name. |
| `BUNNY_STORAGE_PASSWORD` | Server secret | Storage Zone password, **not** the account API key or Stream key. |
| `BUNNY_STORAGE_REGION` | Server | `DE`, `NY`, `LA`, `SG`, `SYD`, `UK`, `SE`, `BR`, or `JH`; default DE. |
| `BUNNY_PUBLIC_CDN_BASE` | Non-secret | Informational public marketing CDN base. Never used to deliver private files. |
| `VITE_INTRO_VIDEO_URL` | Public build variable | Complete HTTPS video URL. Rebuild the frontend after configuring it. |

Registered admin overrides take precedence over environment defaults, including explicitly saved empty values. Removing an encrypted password override restores the environment password. Changing the active provider does not change the provider recorded on existing uploads.

Admin → **Storage & CDN** exposes versioned configuration. Only SUPER_ADMIN can write; existing MFA, reason/confirmation and audit requirements apply. The password is write-only and encrypted using the existing `ADMIN_SECRETS_MASTER_KEY`. The API returns configured/masked state, never plaintext. Local uploads and metadata administration do not decrypt an unused Bunny password.

Saving a credential and testing a connection are separate actions. **Test Connection** creates one UUID-named temporary text object, reads and compares its SHA-256 digest, deletes it and checks that it is absent. Failure messages exclude remote response bodies. If deletion cannot be confirmed, the result includes the temporary object key for operator cleanup. Loading the page does not contact Bunny.

## Access policy

The selected integration is Bunny's HTTP Storage API: fixed allowlisted HTTPS regional origins, `AccessKey` on the server, raw PUT uploads, uppercase SHA-256 upload checksum, authenticated GET/HEAD and DELETE. Requests have timeouts and refuse redirects. Downloads are bounded by the existing 10 MB upload limit and verified against stored checksums.

**Use a dedicated private Storage Zone with no public Pull Zone.** A public CDN attached to a private zone could bypass application authorization. The application does not create zones or modify Bunny account permissions. Verify this isolation in the Bunny account before activation.

Wallet and generated files are delivered through the existing `/api/uploads/:id` endpoint after session and ownership checks, with `private, no-store` responses. User-facing URLs never include the zone, object key, password or permanent CDN location. Exceptional administrative downloads retain two-person grants, expiry/revocation checks and audit. Existing public sharing exclusions remain in place.

No private CDN URL or CDN token key is required by this server-mediated design. `BUNNY_PRIVATE_CDN_BASE` and `BUNNY_CDN_SECURITY_KEY` are deliberately not offered as unused controls. No signed public URLs are issued, so signed-link expiry is not a feature to certify; sessions and administrative grants control access.

The HTTP adapter uses server-mediated uploads with existing MIME validation, quota checks and billing limits. It does not implement S3 presigning or browser-direct uploads, and offers no misleading S3 credential fields. No additional environment variable enables direct upload in this implementation.

## Stored data and switching providers

The additive migration adds six upload columns: `storage_provider`, `storage_key`, `storage_zone`, `storage_region`, `checksum_sha256`, and `asset_kind`. Existing records default to local and retain filenames, IDs, associations and private URLs. Existing size accounting and ownership columns remain unchanged. New file metadata is committed only after upload success; failed commits attempt remote compensation.

Keys are generated from application IDs and safe filenames. Wallet objects use `users/{owner}/wallet/{trip-or-account}/{uuid.ext}`. Generated images use `users/{owner}/trips/{trip-or-account}/generated/{uuid.ext}`. Generated files remain private and are counted separately, without becoming Wallet quota reservations.

Setting Bunny does not move existing local files. Setting Local does not prevent reads of existing Bunny files. An administrator cannot change the zone while existing metadata references another zone. Upload commit and zone changes share a transactional lock; an upload started against a changed zone is rejected and compensated. Keep old storage credentials operational while their objects are still used.

Metadata statistics come from SQL rather than costly remote listings. Inventory labels remote objects as remote; that is not a claim that every remote byte was checked. Explicit storage scans can query remote metadata.

## Optional migration utility

After schema migration and a verified backup, review:

```powershell
node scripts/migrate-bunny-storage.mjs --dry-run
```

It reports known local files, already migrated records, missing database associations, planned keys, errors and record updates. Unassociated disk files are counted, never inferred into user ownership.

Only after reviewing that report and testing the private zone:

```powershell
node scripts/migrate-bunny-storage.mjs --apply
```

Apply copies one associated file at a time, verifies the downloaded bytes, then changes metadata under a transaction. UUID-based deterministic keys make retries safe. It **never deletes the original local file**, including after a successful transfer. A failed transfer leaves local metadata and originals intact; a verified object left by a failed SQL transaction can be overwritten safely on retry. Neither apply nor any production migration was run for this task.

## Google photos and intro video

Google photos never enter this adapter. Overview uses stable itinerary Place IDs, the existing minimal `photos` field mask, owner-bound expiring media tokens, and no-store server responses. Decoded images and attribution exist only in the mounted page; object URLs are revoked on leaving it. Up to ten distinct itinerary places are displayed, fetched as needed rather than in one burst. The runtime writes no photo bytes, photo resource names or Google media URLs to SQL, disk, localStorage or Bunny. Review screenshots are separate test evidence, not application assets or a photo cache.

Google Maps/source and author links appear with the displayed place. Missing, invalid or slow images retain a usable gradient or previous image. Reduced motion disables automatic rotation. Existing private generated trip covers can supply a fallback without becoming public.

The local 11,174,173-byte intro MP4 was removed from `public/media` and retained only in the ignored local audit backup `.local/ux-baseline/intro-original.mp4`. It is absent from `dist`. The user-supplied public URL `https://fast-imgs.b-cdn.net/tripnexa.mp4` is now the default, overridable with `VITE_INTRO_VIDEO_URL`. Verified HTTP 200/video/mp4, HTTP 206 byte-range support and actual Chrome playback (1920×1080, about 9 seconds). The existing error fallback remains available.

## Before any production release

1. Review this branch's full pending changes, including the earlier billing work; this is not a storage-only release.
2. Use Node 22 and a supported configured MySQL/MariaDB deployment, existing session/email/domain settings, a verified database backup and a separate backup of local uploads.
3. Run `npm run db:migrate` against the intended staging database first. It includes all existing pending migrations, not just storage. The storage schema was applied only to isolated test databases here.
4. Provision and verify a private Bunny zone. Configure its password securely through environment or encrypted Admin settings; preserve the master key securely.
5. Run Test Connection and verify upload, owner download, cross-user rejection, administrative grants and deletion with disposable staging files. Real Bunny credentials were unavailable in this local session.
6. Rebuild with the supplied default intro URL or a `VITE_INTRO_VIDEO_URL` override; verify playback and the failure fallback on the deployment domain.
7. Verify Google billing/API restrictions and live photos/attribution in staging. The full error matrix used deterministic fixtures; a separate authorized live Colosseum check passed for search, photo details, media, attribution and desktop/mobile rendering.
8. Complete the separate Stripe/OAuth/SMTP production prerequisites in the existing billing/authentication documentation. No real payment certification is implied by local tests.
9. Review the optional file migration dry-run separately; do not automatically delete originals or deploy based on this document.

References: [Bunny HTTP Storage API](https://bunny.net/docs/storage/http), [Google Place Photos](https://developers.google.com/maps/documentation/places/web-service/place-photos), [Places attribution and storage policies](https://developers.google.com/maps/documentation/places/web-service/policies).
