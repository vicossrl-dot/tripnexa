# Tours & Tickets — affiliate marketplace

Implemented locally on 25 September 2026. **CODE READY — WAITING FOR AFFILIATE ACCOUNT CONFIGURATION.** No deployment, payment processing, purchase, DNS or production infrastructure changes were made.

## Version 1 and current state

GetYourGuide, Viator, Tiqets and Klook share one link-only provider architecture. All four are disabled by default. The local application currently has no saved affiliate provider configuration or affiliate API credentials. No real attribution or commercial destination test is claimed.

An enabled provider can work with exact portal-generated affiliate links and no API. A provider-approved search template is optional. TripSync does not generate tracking from the account identifier, rewrite signed links, invent products/prices, scrape catalogues, or use OpenAI for commerce data.

Optional API catalogue search, product cards, live prices, availability, mapping assistant and conversion/reporting synchronization are extension points, **not implemented live connectors**. Storing a future API credential does not make its API connected. Klook API credential controls are not fabricated; advanced integration requires a separately granted specification/access.

## User experience

Visit cards show Tickets & tours for attraction-like categories, known ticket types, an exact mapped experience, or an ALWAYS override. Ordinary parks, streets, neighborhoods, restaurants, hotels and airports are excluded by automatic category logic. An exact paid-experience mapping may deliberately enable a park. NEVER overrides suppress commercial actions. This means relevant options may exist, not that admission is definitely paid or required.

The modal shows only enabled, resolved providers in configured order; default order is GetYourGuide, Viator, Tiqets, Klook. Commission is never an input. Unknown prices, ratings and availability are omitted. Links open a new tab using `rel="sponsored noopener noreferrer"`. TripSync remains open. Per-provider errors are isolated; unresolved providers are omitted and invalid configured links display a sanitized unavailable message. With no usable links, the modal still offers Travel Wallet.

Existing private attachments associated with the place produce **Ticket saved ✓ / View ticket**. Confirmed or fixed bookings, purchased state and a user's booked declaration suppress the primary shopping CTA. Find another option is secondary. Manual provider metadata is explicitly user-declared and creates no booking/order ID.

Add your ticket to Travel Wallet opens the existing private upload editor for a trip/place association. Saving immediately refreshes ticket state; regeneration is not required. The same association survives itinerary item replacement when its place selection remains. Deleting that place selection removes its association; unrelated private Wallet records are not deleted by this cascade.

## Architecture and data

`server/affiliate-providers/` contains `provider-base.js`, four provider definitions, `index.js`, `ticketability.js`, `service.js`, `router.js`, `admin.js` and `migrate.js`.

Adapters expose `isEnabled`, `getStatus`, `validateAffiliateUrl`, `buildAffiliateSearchLink`, `resolvePlace`, `testIntegration`, and optional `searchProducts` / `normalizeProductData` extension methods. Those optional methods currently return no catalogue data. No API authentication request is made by local link validation.

Resolution order currently implemented: exact enabled Google-place mapping, then explicitly supplied provider-approved search template, otherwise unresolved. Future approved APIs can insert strong/exact catalogue matches between these stages. Product and destination IDs are reference metadata; they are not used to synthesize undocumented URLs. Exact links use `EXACT`; approved search uses `SEARCH_FALLBACK`; no invented STRONG matches are returned.

Context includes place-selection/Google IDs, canonical/display name, city/country, coordinates, visit date/time, language, currency and category/ticket type. Search always combines the complete attraction name with city/country. Ambiguous name-only searches are suppressed. UI contains no provider-specific URL construction.

Additive MySQL tables:

- `affiliate_providers`: versioned configuration and last local validation.
- `affiliate_place_mappings`: global exact mappings, optional product/destination identifiers, priority, creator, version and timestamps.
- `affiliate_place_overrides`: exact Google-place AUTO/ALWAYS/NEVER choice.
- `affiliate_wallet_links`: owner-scoped private place/Wallet association and user-declared provider/booked status.
- `affiliate_click_events`: narrow outbound-click metadata. Existing `analytics_events` has no metadata column, so private request objects were not added to it.

Existing app settings, encrypted `managed_secrets`, role/MFA middleware, transactions and append-only API audit are reused. Legacy `referral_rules` and the private referral configuration file are preserved; they are not silently converted or enabled as provider links. The new provider modal replaces the former generic buy link on visit cards. Migrate approved legacy exact links through Place mappings.

The migration is applied locally and is idempotent. No existing trip/account was promoted, regenerated or commercially configured.

## Admin and permissions

Navigation: **Admin → Revenue → Tours & Tickets / Referral Links / Affiliate Analytics**.

ADMIN can view status/analytics, add/edit/disable exact mappings, change exact-place visibility, and run local validation. SUPER_ADMIN with recent password/MFA can configure providers, allowed hosts, identifiers, templates, ordering and enabled state. Existing sensitive credential controls also require SUPER_ADMIN, recent authentication, a reason and confirmation. Mutations are audited without URLs, raw credentials or private documents in audit metadata.

Provider fields: enabled, display name/order, account/partner/sitebrand reference, default language/currency, approved search template, explicit allowed official domains, exact-only/search fallback, future content-cache TTL. API status and stored-credential status are distinct. API use is not presented as an operational toggle before a connector exists.

Place mappings: search/pagination, provider selection, Google place ID, canonical name, city, country, optional provider IDs, exact affiliate URL, priority, enabled state, Test mapping and Preview destination. Editing uses optimistic version checks. The visibility override is loaded/saved separately for the Google place and also has version checks.

**Test integration / Test mapping performs local format, HTTPS, host and known tracking validation.** It does not verify a remote page, affiliate account ownership, redirect response or attribution. Preview destination opens the exact approved link so the operator can inspect relevance. Last check is explicitly local validation, not an API connectivity claim.

## MANUAL AFFILIATE SETUP REQUIRED — each provider

| Provider | Enter in Admin | API / actual verification |
| --- | --- | --- |
| GetYourGuide | Partner ID as a reference; paste the complete Partner Portal deep link into the exact attraction mapping. Known `partner_id` tracking is required. | API optional; not configured. Link adapter tested with fixtures; no real partner test. |
| Viator | Affiliate/account ID as a reference; paste the full generated link, retaining `pid`, `mcid`, `medium` and supplied campaign unchanged. | Affiliate API optional; not configured. No merchant/booking endpoints. Fixture test only. |
| Tiqets | Affiliate/sitebrand reference; paste the complete Link Generator URL with its supplied sitebrand/campaign settings. | Partner API optional; not configured. Booking API not required. Fixture test only. |
| Klook | Official affiliate/account or referral-code reference; paste the complete official portal-generated URL. | Basic links need no API. Advanced API/feed not configured; no invented API contract. Fixture test only. |

All four require the user's own affiliate account. Reference identifiers do not automatically modify URLs. Set language, currency and campaigns in the provider's generator before pasting the exact URL. Unsupported shortened domains are rejected: obtain a complete approved provider-domain URL. Allowed-host changes are restricted to explicit subdomains of the corresponding official root; adding a different partner root requires a code/documentation review.

Steps:

1. Register and obtain approval in the official provider portal.
2. Generate a relevant attraction/product link, initially Sagrada Familia, Barcelona.
3. Configure the provider in Admin; save an exact Google-place mapping with that complete URL and confirm its provenance.
4. Enable the provider, run local validation, and preview the destination.
5. Verify the actual relevant landing page and tracking with the real account. Never purchase just to test.
6. Repeat for the other attractions/providers. If a provider explicitly supports a dynamic search format, configure that optional template; otherwise retain exact mappings only.

Official references checked on 25 September 2026:

- [GetYourGuide deep links and Link Builder](https://partner.getyourguide.support/hc/en-us/articles/13981115676061-Deep-links-101); [documented partner ID format](https://partner.getyourguide.support/hc/en-us/articles/13830964721693-Trouble-with-unique-link-not-found-error).
- [Viator generated affiliate links](https://partnerresources.viator.com/travel-content/links/create-links/); [tracking attribution parameters](https://partnerresources.viator.com/blog/attribution/).
- [Tiqets Link Generator](https://partners.tiqets.com/en_us/link-generator-SyRALT3Mj); [optional Partner API access](https://www.tiqets.com/partner-program/blog/tiqets-partner-api-affiliates/).
- [Klook official Affiliate Program and advanced integrations](https://affiliate.klook.com/home).

## Security, disclosures and privacy

Only HTTPS URLs on explicit official allowlisted hosts are accepted. Credentials in authority/query, nonstandard ports, backslashes, unsafe schemes, private/unapproved hosts, unknown template fields and detectable unapproved nested redirects are rejected. Exact URLs are returned byte-for-byte; query parameters are not reordered or serialized. Signed/opaque templates are rejected. TripSync performs no server-side outbound URL fetch and is not an open redirect endpoint. Future remote redirect checks must preserve these restrictions at every hop.

Managed credentials use the existing AES-GCM infrastructure with context. `GETYOURGUIDE_API_KEY`, `VIATOR_API_KEY`, and `TIQETS_API_TOKEN` can be stored write-only for future connectors under AI & Providers. Plaintext/ciphertext is never returned. Choose Save without a live test because these content connectors are not activated. No new permanent master key was generated.

App Settings: `affiliate_disclosure_text`, `affiliate_disclosure_url`, `affiliate_public_enabled`. Default disclosure is visible in the modal and site-wide footer. Public actions default on when nonempty disclosure and public sharing/referral flags permit them. Clearing disclosure suppresses affiliate links; turning off public actions rejects their public endpoints. An existing JSON string-setting decoding issue was fixed so empty or ordinary disclosure text can be safely saved/read/rolled back.

Authenticated endpoints:

```text
GET  /api/trips/:id/tickets/:visit
POST /api/trips/:id/tickets/:visit/click
POST /api/trips/:id/tickets/:visit/booked
POST /api/trips/:id/tickets/:visit/wallet
```

They validate trip, visit and selection ownership. Public GET/click endpoints are under `/api/shared/:token/tickets/:visit`, validate current sharing/token/settings, and return no Wallet association, user ID, private file, booking declaration/provider history or booking number. No private endpoints accept a share token as authorization. Account export includes the owner's ticket associations.

Click metadata contains provider, trip/place IDs, public attraction/city, resolution type and timestamp. It contains no ticket files or private notes. Browser click tracking is best-effort and does not block navigation; clicks represent outbound intent, not provider-confirmed navigation or purchases. Rate limits apply. Reports expose totals, today, provider, destination, attraction, mapping type and distinct trips; **sales/revenue/conversion are N/A**, never inferred as zero or populated from clicks.

Future `affiliate_conversion`, `affiliate_commission` and `affiliate_revenue` import must consume official authorized reporting with idempotent external event IDs. No synthetic sales are stored. Link-only generation has no content cache; configured TTL is reserved for approved content integration and must not be used to cache live prices beyond provider policy.

Provider names are rendered as text; no scraped or unapproved logos are used. PDF output retains its concise ticket status and has no long affiliate URLs.

## Verification

- Typecheck, ESLint and build pass. Existing main-bundle size warning remains.
- 66 unit/HTTP tests and 28 MySQL tests pass, including URL attacks, exact URL preservation, owner/MFA/role checks, stale provider configuration, encrypted credentials, all-disabled behavior, disclosure/public gates, provider failure isolation and private Wallet association.
- Four-provider mapping matrix covers Sagrada Familia/Barcelona, Colosseum/Rome, Louvre Museum/Paris and Eiffel Tower/Paris; a generic free park has no automatic CTA. These are isolated fixtures, not real commercial account tests.
- Chrome affiliate E2E passes: desktop/mobile cards, secure new-tab link attributes, focus trap, Escape/focus return, manual booked state, actual QR upload UI, immediate/reloaded Ticket saved, private Wallet preview, anonymous modal without booking state, Admin configuration/mappings/analytics and no unhandled exceptions.
- Existing full Chrome smoke and full local fixture journey pass: creation, Update Plan/autosave/reload, Suggestions, Itinerary/editing, Trip Health/repair, restaurant choice, Wallet, PDF, sharing and Admin/MFA.

Commands (isolated test database required):

```powershell
npm.cmd run db:migrate
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/verify-affiliates.mjs
node scripts/smoke-browser.mjs --full
node scripts/final-verification.mjs --local
```

Artifacts: `.local/affiliate-verification/report.json`, desktop/mobile modal and ticket screenshots, Wallet preview, Admin providers/configuration/mappings/analytics. Browser tests validate link attributes/tracking with fixtures; they do not send fake partner IDs to external sites or verify real attribution. Test provider configuration is restored and temporary accounts/files/mappings are cleaned afterward.

**Remaining activation prerequisite:** configure the four official accounts/links, then run real destination/attribution checks without purchasing. API/product enrichment is optional future work. The earlier production blockers in `FINAL_PREPRODUCTION_AUDIT.md` are not resolved by this affiliate feature.
