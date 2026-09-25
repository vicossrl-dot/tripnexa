# Google and Sign in with Apple

Implemented locally on 25 September 2026. Google and Apple are additional authentication methods. Password login, verification, reset, session revocation and privileged MFA remain available.

**Actual installation status:** neither provider has OAuth credentials configured. Both remain disabled. Signed provider fixtures passed HTTP/MySQL and Chrome tests; real Google and Apple account login has **not** been performed. Apple real testing additionally requires the configured public HTTPS application domain.

## Setup

Run `npm.cmd run db:migrate` for the additive schema. Existing users and IDs are preserved. Configure **Admin → Authentication Providers** with a SUPER_ADMIN session and recent password/MFA confirmation. IDs and enablement are versioned; credentials are encrypted using `ADMIN_SECRETS_MASTER_KEY`, never returned to the browser, and never logged.

Google:

1. Create a Google OAuth **Web application** client and configure consent/test users as applicable.
2. Copy the exact callback from Admin. Current local callback is `http://localhost:5173/api/auth/google/callback`. Open the application at `http://localhost:5173` for that configuration; 127.0.0.1 is a different cookie host.
3. Enter Client ID and Client Secret, enable Google, acknowledge the callback in the provider console, and save. The Maps API key is unrelated.
4. Run **Check configuration**, then test real login/logout/login with your Google account. A configuration/JWKS check is not proof that the client secret or a real login works.

Apple:

1. Configure an eligible primary App ID and web Services ID in Apple Developer. Add the HTTPS application domain and exact Return URL displayed in Admin.
2. Enter Services ID, Team ID, Key ID, and the .p8 PKCS8 private key. The secret field accepts multiline key contents and only writes encrypted storage.
3. Enable Apple and acknowledge the domain/Return URL after updating Apple Developer. HTTP localhost is not treated as an Apple production test environment.
4. Check configuration, including ES256 client-secret generation, then test on the configured HTTPS application domain.

The backend generates an Apple client-secret JWT with a five-minute lifetime for each token exchange. Operators do not maintain short-lived JWT strings manually.

## Environment and Admin priority

Server-only variables: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`.

Saved provider settings override environment identifiers/enablement. With no saved row, an environment Client ID enables the provider only when all required fields and a valid callback exist. Managed encrypted credentials override their corresponding environment secret. If decryption fails, the provider fails closed instead of falling back silently. On first use, an environment-backed callback baseline is recorded so later environment domain changes require console reconfirmation.

See [Domain configuration](DOMAIN_CONFIGURATION.md) for URL priority, callback derivation and migration instructions.

## Flow and security

- Google uses authorization code + OIDC, scopes `openid email profile`, S256 PKCE and nonce. Apple uses authorization code with `form_post`, scopes `name email`, state and nonce. Apple PKCE is not claimed or sent by this implementation; its confidential-client exchange uses the signed ES256 client secret.
- `jose` validates provider JWT signatures against fixed provider JWKS URLs, issuer, audience, expiry, issued-at/maximum age, nonce, subject and Google authorized-party constraints. JWT-controlled key URLs are not trusted.
- Random state is hashed in MySQL, browser-bound, provider-bound, expires after ten minutes, and is consumed once before exchanging a code. Google PKCE verifier and nonce are temporary server-side values. A configuration fingerprint rejects stale callbacks after domain/client/secret changes.
- Only stable `(provider, subject)` identifies an external identity. That pair and `(user, provider)` are unique in MySQL. Identity mutations serialize under a transactional lock.
- New accounts are always USER/ACTIVE. Existing same-email accounts are not silently merged: the user must confirm the existing password. Password reset provides recovery; alternatively sign in with an existing method and explicitly connect from the profile.
- Explicit profile linking can use a different verified provider email after recent authentication. Linking cannot claim an identity belonging to another user. Apple relay emails and subsequent Apple responses without email are supported. Apple's first-authorization name is optional display data, never identity proof.
- ACTIVE is required for every sign-in. SUSPENDED, DISABLED and PENDING_DELETION are rejected. Connect/reauth callbacks require the original account session to remain valid. Reauthentication must use an already linked identity.
- All successful methods create the existing opaque server session. No frontend auth JWT, access token or refresh token is persisted. A new privileged session has no MFA verification, so Admin still requires its existing MFA challenge.
- Start, callback, linking, disconnect, password creation, provider checks and domain validation are rate-limited. Return paths cannot point to external origins or API endpoints. Audit records contain safe event metadata, not authorization codes, ID/access/refresh tokens or credentials.
- Session cookies are HttpOnly and host-only. Normal SameSite=Lax and production Secure settings remain unchanged; only the dedicated Apple callback-binding cookie uses SameSite=None + Secure.

Temporary flow/link records expire after ten minutes and are removed by hourly cleanup. Linked identity metadata remains until disconnected or the user is deleted. No remote avatar is fetched or trusted automatically.

## User and Admin interface

Login/register show official Google/Apple buttons only for ready, enabled providers. Duplicate clicks are disabled during redirect; failures return a friendly message and preserve password login. Public `/api/auth/providers` returns only safe availability/UI fields.

Profile → **Security & privacy → Connected accounts** shows methods, supports linking and disconnect, and offers password creation for social-only users after recent sign-in. Disconnect cannot remove the final usable method. A configured password also supports existing data export/deletion confirmation flows. Method changes revoke other sessions. Existing password changes still sign out all sessions.

Admin user summaries expose method-presence booleans, not provider tokens or passwords. System Health reports URLs and callback readiness without contacting providers on every render. Account identity attachment is not an administrator support operation.

## Tests and screenshots

```
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:MYSQL_TEST_DATABASE='tripsync_test'
npm.cmd run test:integration
npm.cmd run build
node scripts/verify-social.mjs
node scripts/smoke-browser.mjs --full --mock-providers
node scripts/final-verification.mjs --local
node scripts/verify-affiliates.mjs
```

The social Chrome script intercepts the Google authorization navigation before external access and supplies signed local ID tokens. It verifies button→callback→Home, account reuse, password-confirmed collision linking, last-method protection, mobile layout, Admin screens, errors and disabled-provider behavior. It does **not** impersonate a real provider test.

Artifacts: `.local/social-verification/report.json` and `01-login-mobile.png`, `02-home-after-google.png`, `03-connected-mobile.png`, `04-admin-domains.png`, `05-admin-authentication.png`, `06-health.png`, `07-login-error.png`.

## Primary references

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google branding](https://developers.google.com/identity/branding-guidelines)
- [Apple web configuration](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Apple token exchange](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens)
- [jose remote JWKS](https://github.com/panva/jose/blob/main/docs/jwks/remote/functions/createRemoteJWKSet.md)
