# Portable domain configuration

Implemented locally on 25 September 2026. No deployment or production DNS changes were made.

## Two independent origins

- **Public Site URL** is the public marketing website. The authentication pages' “Visit our website” link uses it.
- **Application URL** hosts this React application and its same-origin `/api` backend. Login, registration, Admin, provider callbacks, verification/reset emails and newly generated share links use this origin.

The marketing website is not bundled here. Admin exposes copyable login and registration CTA URLs for its operator. Outbound affiliate and Google Maps URLs remain provider-controlled. The PDF currently does not embed absolute internal application links.

## Configure in Admin

Open **Admin → Configuration → Domains & URLs**. Reading requires administrator MFA. Saving or validating requires SUPER_ADMIN and password/MFA verified within ten minutes.

Enter root origins without paths, credentials, queries or fragments. HTTPS is required, except HTTP loopback origins in development. Production rejects localhost and IP-address origins. Validation checks syntax and policy without fetching an operator-supplied host. It does not claim to verify DNS or certificates.

The page shows effective values, their source, copyable generated URLs, and a local callback in Authentication Providers when a loopback development URL is available. If both origins are identical, explicitly acknowledge that arrangement. Saving requires a reason and an unchanged configuration version. Domain audit events record actor, timestamp and sanitized previous/new effective origins.

“Use environment defaults” clears form overrides; **Save URLs** applies that reset. Invalid production fallback is rejected.

## Priority and refresh

Application: **Admin database override → `PUBLIC_APP_URL` → legacy `APP_URL` → development fallback**.

Public site: **Admin database override → `PUBLIC_SITE_URL` → Application URL in development only**.

Without a valid production origin the resolver returns a missing configuration warning, OAuth cannot start, and production startup fails. It never silently generates production localhost links. Production startup also retains the existing SMTP requirement.

Admin changes apply to subsequent requests without rebuilding or restarting. Environment changes require restarting the backend. Do not use `VITE_*` variables for provider secrets. Domain overrides are installation-wide, not owner-specific.

Current local installation: Application URL `http://localhost:5173` from legacy `APP_URL`; Public Site URL falls back to it for development. No production override was applied.

## URL generation

`server/app-urls.js` centralizes root validation, URL resolution and builders:

| Purpose | Path on Application URL |
|---|---|
| Login / register | `/login`, `/register` |
| Admin / API | `/admin`, `/api` |
| Google callback | `/api/auth/google/callback` |
| Apple Return URL | `/api/auth/apple/callback` |
| Verify email | `/register?verifyEmail=…` plus the separately delivered verification code |
| Reset password | `/reset-password?token=…&user=…` |
| Shared trip | `/share/{opaque-token}` |

Email links are generated when mail is issued; already delivered emails cannot be rewritten. The share dialog asks the owner-scoped server endpoint for the current URL whenever opened. Existing tokens retain their meaning after moving the same database to another host.

## Cookies and CORS

Normal sessions remain host-only: no `Domain` attribute, HttpOnly, SameSite=Lax, Secure in production. Marketing and application origins do not share cookies. Apple uses a separate short-lived HttpOnly/Secure/SameSite=None browser-binding cookie for its cross-site POST callback; the normal session cookie is unchanged.

Frontend requests use relative `/api` URLs. No wildcard or credentialed cross-origin CORS access is enabled. Write requests retain the application request header and Origin checks against the configured application origin. The marketing origin is not automatically trusted for API writes. Only Apple's exact POST callback bypasses the normal request-header check; it requires one-use state and a matching browser-binding cookie.

Use the **exact Application URL** for social sign-in. `localhost` and `127.0.0.1` have different cookies. An OAuth start from another origin fails with the configured address rather than beginning a flow that will lose its browser binding. Local Vite proxies `/api` to Express, so the callback uses the frontend port, not a guessed backend port.

## Moving an installation

Current intended production example (not activated locally):

```
Public site: https://tripnexa.app
Application: https://my.tripnexa.app
```

New installation example:

```
Public site: https://example.com
Application: https://app.example.com
```

1. Prepare DNS, TLS and reverse-proxy routing externally. Keep `/api` on the application origin. Configure `TRUST_PROXY=1` only behind the intended single trusted proxy.
2. Change both origins in Admin, or change environment variables and restart. Database overrides take priority over environment changes.
3. Update Google's authorized redirect URI to `https://app.example.com/api/auth/google/callback` and its consent/authorized-domain settings.
4. Update the Apple Services ID domain to `app.example.com` and Return URL to `https://app.example.com/api/auth/apple/callback`.
5. In Authentication Providers, confirm that the exact displayed callback/domain is configured and save. Application-domain changes mark previously configured providers **Requires provider update**, including environment-backed providers after their callback baseline has been recorded. In-flight OAuth attempts are invalidated by configuration fingerprints.
6. Update external marketing CTA links from the copyable Admin values. Test verification/reset emails, Google/Apple login, public sharing, host-only cookies, logout, and privileged MFA on the new origin.

No application source-code edit is required. TripSync cannot update Google/Apple consoles or DNS automatically. Existing sessions on the old hostname do not migrate across cookie origins; users sign in again.

## Verification

Automated tests cover alpha→beta URL generation, Admin-over-env precedence and reset, missing/insecure production origins, origin checks, role/MFA restrictions, version conflicts, domain audit events, and rejection of OAuth flows started before a domain change. Browser captures are in `.local/social-verification/`.
