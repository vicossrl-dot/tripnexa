# Trip title and integration setup

## Trip title

`src/components/trip/TripUI.jsx` and `src/styles/trip-experience.css` now render the current trip as a centered, understated peach/neutral framed wordmark using a system serif font. Equal outer desktop columns keep it centered despite unequal logo/action widths. On smaller screens it has its own centered row; long names use ellipsis and retain a full-name tooltip. No name data, routes or navigation behavior changed.

## Admin tutorials

Added `src/components/admin/IntegrationSetup.jsx`, embedded through `AdminStorage.jsx` and `AdminBilling.jsx`, with scoped styles in `src/styles/admin.css`. Open **Admin → Storage & CDN** for Bunny and **Admin → Billing** for Stripe. Both guides contain numbered instructions, copyable field names, credential warnings, links to the other guide, and checklists distinguishing presence from verified operation. No new API, storage architecture or payment flow was added.

### Bunny fields

| Admin field | Server environment alternative | Obtain value from |
|---|---|---|
| `storage_provider` | `STORAGE_PROVIDER` | Select `bunny` after testing; `local` needs no Bunny credentials |
| `bunny_storage_zone` | `BUNNY_STORAGE_ZONE` | Bunny Dashboard → Storage → exact zone name |
| `bunny_storage_region` | `BUNNY_STORAGE_REGION` | Zone's primary region; supported codes DE, NY, LA, SG, SYD, UK, SE, BR, JH |
| Encrypted credential `BUNNY_STORAGE_PASSWORD` | `BUNNY_STORAGE_PASSWORD` | Zone → FTP & API Access → Storage Zone password, not account API key |
| `bunny_public_cdn_base` (optional) | `BUNNY_PUBLIC_CDN_BASE` | Separate public Pull Zone's HTTPS base URL |

All Bunny Admin fields are on Storage & CDN. Setting labels replace underscores with spaces. Private avatars, reservations, Wallet files and stored generated images use authenticated application endpoints. Do not connect a public Pull Zone to their storage zone. The optional CDN field describes public marketing assets; it neither exposes private objects nor changes the configured hero video URL. The existing public intro is configured separately through browser-safe `VITE_INTRO_VIDEO_URL`, defaulting to `https://fast-imgs.b-cdn.net/tripnexa.mp4`. Google Places photos are not stored there.

Use **Test Connection** (SUPER_ADMIN, recent MFA, reason, `TEST`) to upload/read/delete a temporary object. Then select Bunny and test a profile photo and Wallet document through the application, including reload/login. A successful temporary-object test alone does not certify the full user upload flow.

### Stripe fields

Hosted Checkout and Customer Portal are implemented. No browser Stripe SDK/key is required for this flow.

| Value | Where to obtain it | Where to enter it |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers / API keys, same mode as prices | Admin → AI & Integrations → Encrypted credentials, or server environment |
| `STRIPE_WEBHOOK_SECRET` | Reveal signing secret on the specific webhook destination (`whsec_…`) | Same Admin credentials section, or server environment |
| `STRIPE_PUBLISHABLE_KEY` | Stripe API keys | Optional/reserved; supported as managed credential or environment variable but not required by hosted Checkout |
| `stripe_portal_configuration` | Stripe Settings → Billing → Customer portal configuration ID (`bpc_…`) | Admin → Billing → Stripe prices and portal; **no environment fallback** |
| `billing_provider`, `billing_mode` | Choose `stripe`, and initially `test` | Admin → Billing policies; environment defaults `BILLING_PROVIDER`, `BILLING_MODE` |
| `billing_enabled`, `billing_enforcement_enabled` | Operator switches; initially false | Same Admin section; defaults `BILLING_ENABLED`, `BILLING_ENFORCEMENT_ENABLED` |

Create USD products/prices in Stripe Product catalogue. Copy **Price IDs**, not Product IDs, into Admin → Billing → Stripe prices and portal:

| Price | Admin field | Environment alternative |
|---|---|---|
| $9.99 monthly recurring | `stripe_price_pro_monthly` | `STRIPE_PRICE_PRO_MONTHLY` |
| $79.99 yearly recurring | `stripe_price_pro_annual` | `STRIPE_PRICE_PRO_ANNUAL` |
| $14.99 once / 5 credits | `stripe_price_trip_pack_5` | `STRIPE_PRICE_TRIP_PACK_5` |
| $24.99 once / 10 credits | `stripe_price_trip_pack_10` | `STRIPE_PRICE_TRIP_PACK_10` |
| $39.99 once / 20 credits | `stripe_price_trip_pack_20` | `STRIPE_PRICE_TRIP_PACK_20` |

Recurring prices must be licensed, quantity one. Product IDs are discovered by validation, not entered separately. Portal must enable invoice history, payment method updates and cancellation at period end; subscription price/quantity changes must be disabled. Leave Admin-only `billing_automatic_tax` and `billing_paypal_enabled` off until those services are separately configured and tested in Stripe. PayPal, if used, is through Stripe.

### Exact webhook

Backend: **POST `/api/billing/webhook`**. Enter `https://<actual-application-domain>/api/billing/webhook` in Stripe. If your installation uses `https://my.tripnexa.app`, the exact URL is **`https://my.tripnexa.app/api/billing/webhook`**; production domain was not verified during this task. Confirm the public application URL in Admin → Domains.

In Stripe Workbench → Webhooks → Create an event destination, select Your account, snapshot events, Webhook endpoint and the backend's pinned API version `2026-08-26.dahlia`. Select all implemented events:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_succeeded
invoice.payment_failed
invoice.payment_action_required
charge.refunded
refund.updated
refund.created
```

Use the endpoint's own signing secret; CLI and deployed endpoint secrets differ. Run **Validate Stripe configuration** in Admin → Billing: five prices and portal policy must pass. This is a read-only API check, not a payment/webhook test. Then enable purchases in test mode, complete Checkout for each plan/pack, check Stripe deliveries and processed application events, and verify entitlements, Portal, cancellations, renewals and refunds. Repeat with separate live prices/keys/portal/webhook before enabling production purchases.

Provider UI instructions checked against [Stripe webhook documentation](https://docs.stripe.com/webhooks) and [Bunny's Storage FAQ](https://bunny.net/faq/). Application-specific fields, events, amounts and routes were read from the current backend.

## What is missing

Read-only inspection of the **local** configuration found: storage provider `local`, default region DE, no Bunny zone/password/public CDN value; Stripe mode `test`, purchases disabled, no secret key, webhook secret, portal ID or any of the five Price IDs. No secret values were printed. Production configuration was not accessed.

Bunny is optional if retaining local storage. If selecting Bunny, enter the zone, matching region and password and test it. The public CDN base is optional. For Stripe, enter all five prices, API and signing secrets, portal ID, mode and correct application URL; register and test the webhook before enabling purchases. Admin-managed values override server environment defaults. Encrypted Admin editing requires the existing server-only `ADMIN_SECRETS_MASTER_KEY`; never rotate it casually or put secrets in frontend/public variables.

The previously identified missing storage/billing migrations in the main local database remain a separate prerequisite. This task does not apply migrations to the main database or alter existing account entitlements.

## Verification

- Lint and typecheck passed; 81 unit tests passed; production build passed with its existing large-chunk warning.
- Chrome verification: 28 checks passed, including both responsive Admin tutorials, centered/truncated long trip names at 320/390/820/1440 px, navigation, local photo uploads and no unexpected browser errors. Results and screenshots: `.local/integration-setup-verification/`.
- No real Bunny upload or Stripe API configuration validation was possible with the missing local credentials. Fixture/local tests do not certify these external services.
- No deployment, secret changes, production database changes or commits.
