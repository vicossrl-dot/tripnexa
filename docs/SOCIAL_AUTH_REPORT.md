# Final local report — social authentication and portable domains

25 September 2026. Implementation complete for local validation; production activation and real provider login remain pending external configuration. No deployment or DNS change.

## Domain configuration

| Item | Result |
|---|---|
| Admin Domains & URLs | Implemented |
| Main website URL | `http://localhost:5173` — development fallback |
| Application URL | `http://localhost:5173` — env, legacy `APP_URL` |
| Priority | Admin DB → PUBLIC_* env → APP_URL for application → development fallback |
| Login | `http://localhost:5173/login` |
| Register | `http://localhost:5173/register` |
| Admin | `http://localhost:5173/admin` |
| API | `http://localhost:5173/api` |
| Google callback | `http://localhost:5173/api/auth/google/callback` |
| Apple callback, derived but unavailable for real Apple login on HTTP | `http://localhost:5173/api/auth/apple/callback` |
| Hardcoded production domain dependencies | None in src/server/public/scripts |
| Portability alpha → beta, Admin override and env reset | PASS |
| Verification email / password reset / public sharing | Dynamic central URL builders |

Intended production values remain documentation examples: public `https://tripnexa.app`, application `https://my.tripnexa.app`. They were not activated in the local database. Production callbacks will derive from whichever Application URL the operator configures.

## Providers

| Item | Google | Apple |
|---|---|---|
| Implementation | READY for configured-provider validation | READY for configured HTTPS/provider validation |
| Current effective availability | Disabled | Disabled |
| Client ID / Services ID | Not configured | Not configured |
| Client secret / private key | Not configured | Not configured |
| Team ID / Key ID | Not applicable | Both not configured |
| Callback / Return URL | Generated from Application URL | Generated from Application URL |
| Real account login | NOT TESTED — credentials missing | WAITING FOR HTTPS CONFIGURATION and credentials |
| Signed local provider tests | PASS | PASS, including form POST and relay/no-email cases |
| Account linking / duplicate prevention | Implemented and tested | Implemented and tested |

## Admin and user account

Domains & URLs, Authentication Providers, official setup links, encrypted write-only credentials, System Health domain/provider status and user sign-in-method indicators are implemented. Credential non-disclosure, optimistic version conflicts and privilege restrictions passed tests.

Connected Accounts and password creation are implemented. Safe disconnect, last-method protection, explicit linking with different email, stable identity reuse, session revocation and recent reauthentication passed tests.

## Security

| Control | Evidence/result |
|---|---|
| State | Random, hashed, browser-bound, expiring, one-use; HTTP tests PASS |
| Nonce / signature / issuer / audience / age | Signed JWT tests PASS |
| PKCE | Google S256; protects the code exchange. Apple uses confidential-client signed secret, without claiming PKCE support |
| Account status | ACTIVE required; all three restricted statuses tested |
| Admin MFA | Social admin login creates a normal session that still requires MFA |
| Secret exposure | None observed in safe APIs, UI or audit output; encrypted storage verified |
| Cookies | Host-only and HttpOnly verified in HTTP; normal Lax retained; Secure enabled in production code. Apple binding cookie None+Secure verified |
| CORS / CSRF | No cross-origin CORS permission added; configured app-origin checks tested; only exact Apple POST callback has its state/binding-based exception |
| Domain changes | Old flows rejected; provider console update required for Admin and later env-origin changes |

## Verification

| Check | Result |
|---|---|
| Typecheck | PASS |
| ESLint | PASS |
| Unit/HTTP | 71 PASS |
| MySQL | 37 PASS |
| Security / portability | PASS within the suites above |
| Build | PASS; existing large main-bundle warning remains |
| Social Chrome | PASS; signed local fixtures, 12 checks, no unhandled exceptions |
| Full Chrome smoke | PASS; `--full --mock-providers` |
| Final user-side regression | PASS; `final-verification.mjs --local` |
| Affiliate Chrome regression | PASS |

Chrome includes Home, creation, autosave/reload, planning suggestions, itinerary changes, Trip Health/Repair/Undo, Wallet, restaurants, PDF, sharing, password flows, Admin/MFA and the new social UI. Real Google/Apple login is explicitly excluded from these PASS claims.

## Screenshots

- [Mobile Google and Apple buttons, fixture configuration](../.local/social-verification/08-login-both-mobile.png)
- [Connected accounts](../.local/social-verification/03-connected-mobile.png)
- [Admin domains](../.local/social-verification/04-admin-domains.png)
- [Admin authentication](../.local/social-verification/05-admin-authentication.png)
- [System Health](../.local/social-verification/06-health.png)

The provider-enabled screenshots show test fixtures, not configured real OAuth accounts.

## Production blockers

Configure production HTTPS origins/infrastructure, Google OAuth credentials and console, Apple Developer credentials/domain/Return URL, then perform real account login/logout/relogin and MFA checks. Existing preproduction blockers remain: real SMTP delivery, the outstanding complex live AI scenario, operational deletion handling, and infrastructure/backup verification. The remaining Admin placeholder sections are not declared finished by this task.

Setup and migration guides: [SOCIAL_AUTH.md](SOCIAL_AUTH.md), [DOMAIN_CONFIGURATION.md](DOMAIN_CONFIGURATION.md). Broader context: [FINAL_PREPRODUCTION_AUDIT.md](FINAL_PREPRODUCTION_AUDIT.md).
