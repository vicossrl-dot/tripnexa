# Billing staging, deployment and rollback

No remote staging or production deployment has been performed. The operator's existing `deploy-prod.sh` and `rollback-prod.sh` have been inspected and remain unchanged. They target production paths; do not run them against an assumed staging path. Remote access and the actual staging worker/runtime paths have not been provided.

## Before any non-test migration

Use the existing Node 22 environment and a database-specific, least-privilege credential. Configure `MYSQL_SOCKET` if required by CloudLinux; otherwise host/port behavior is unchanged. Do not install system services or replace the host's Node runtime.

```sh
node --version
node scripts/billing-preflight.mjs
# Choose a NEW protected filename; MYSQLDUMP_PATH can point to mariadb-dump.
MYSQLDUMP_PATH=/usr/bin/mariadb-dump node scripts/billing-preflight.mjs --backup=/path/to/private-backups/tripnexa-before-billing.sql
```

Preflight lists only schema/table names and aggregate row counts; it does not print credentials or records. Backup credentials pass to the child via its environment, never command arguments. The output file is created exclusively with restrictive permissions. A dump is not a verified backup until restored successfully into a separate disposable database. Also back up private uploads and the protected shared environment outside the release archive. Never restore a pre-billing database over later paid orders or ledger entries.

Test migration and restoration in staging first. Compare user/trip/upload counts and legacy entitlements. Do not run destructive down migrations. Keep purchases/enforcement off during this preparation.

## Staging runbook

1. Create/verify `https://staging.tripnexa.app`, its dedicated runtime/releases/shared directories, database and private upload root. Do not reuse production Stripe live keys, worker patterns or database. Public site/application URLs are environment-specific managed settings.
2. Inspect the reviewed release archive and checksum. It must include `server/`, `dist/`, package manifests, preflight and billing docs. It must not contain `.env`, `.local`, backups, uploads, caches, `.git` or `node_modules`.
3. Unpack into a new staging release. Preserve shared environment/uploads. Run `npm ci --omit=dev` using Node 22; run preflight against the actual staging DB and save/restore-test its backup.
4. In that release, with staging environment only: `npm run db:migrate`. Repeat it and verify idempotency. Check the legacy migration marker and unchanged existing row counts.
5. Use the hosting panel's established release activation procedure and restart only the exact staging Passenger/lsnode worker. The production script's hardcoded worker pattern is not a staging pattern. Never kill all Node workers.
6. Verify `/api/health`, login/logout, MFA, existing trip access, owner isolation, Wallet downloads, AI/manual planning, actual Chrome PDF rendering and all four affiliate providers. Chromium availability on CloudLinux is an external prerequisite already required by the existing PDF engine.
7. Configure Stripe **test** prices/keys/webhook/Portal according to `BILLING_SETUP.md`; record every real Stripe test result separately from local provider fixtures. Confirm raw body/signature handling through the actual LiteSpeed proxy and no redirect on the webhook URL.
8. Verify end-of-period cancellation, monthly/annual renewal and failed payment with Stripe test clocks, 20-trip periods, pack purchases/activation, retries/refunds, PayPal if account-approved, Admin grants and both kill switches. Inspect browser desktop/mobile screenshots.
9. Rehearse rollback to the previous application release while retaining additive billing tables and private uploads. Resume the new release and reconcile any pending events. Obtain explicit production approval only after recording the staging result.

## Production commands — operator execution only after approval

The existing operator scripts use `/home/tripnexa/apps/tripnexa/{runtime,releases,shared}` and Node 22 under `/opt/alt/alt-nodejs22/root/usr/bin`. Confirm these paths on the actual host. Their application backup excludes the real `.env`; retain a separate protected environment/upload backup. They do not automatically provide a database backup or apply this migration.

```sh
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
# In a verified staging-tested release with the production shared environment:
node scripts/billing-preflight.mjs
MYSQLDUMP_PATH=/usr/bin/mariadb-dump node scripts/billing-preflight.mjs --backup=/verified/private/path/pre-billing.sql
# After restore-tested backup and the approved maintenance window:
npm run db:migrate
# Existing reviewed production activation (archive path chosen by operator):
bash /home/tripnexa/.tripnexa-deploy/deploy-prod.sh /verified/path/tripnexa-billing.tar.gz
```

The archive must come from the exact reviewed source/build. Do not run a generic `killall node` or rebuild secret-bearing config into Vite. First start with purchases/enforcement OFF. Verify live-mode configuration and webhook delivery, then enable the approved launch policies through audited Admin changes. Inspect failed inbox records and financial status in Stripe.

## Rollback

Preferred operational rollback: turn `billing_enabled` and `billing_enforcement_enabled` off in Admin with a reason. The billing module continues accepting verified webhooks and preserves orders, credits, usage and entitlements. This can restore normal app access without reverting paid accounting.

For a required code rollback, use the existing reviewed operator rollback script and the exact backup path printed by deployment. Preserve the database, shared environment and uploads:

```sh
bash /home/tripnexa/.tripnexa-deploy/rollback-prod.sh /verified/runtime-backup-path
```

An older release has no billing webhook endpoint. Pause new purchases first; retain Stripe events and reconcile/replay them when restoring billing. Stripe retry retention is finite: do not leave paid subscriptions unmonitored on old code. Trips created by old code will need explicit entitlement reconciliation before enforcement resumes; do not rerun/remove `legacy_v1` to silently promote every free trip. Never discard ledger records or restore stale balances to hide a migration or payment error.

## Local verification environment

The main local database and real `.env` were not migrated/edited. The existing `tripsync_test` database was inspected (45 tables, zero users/trips before billing) and dumped to `.local/billing-backups/test-before-billing.sql` before migration. A separate empty MariaDB 10.6.21 instance was initialized on loopback port 3308 with a generated private credential and `billing_maria_test`; no Windows service was installed. Official Node 22.23.3 and MariaDB archives were checksum-verified. This validates application SQL/runtime locally, not the remote CloudLinux/LiteSpeed environment.

Reproducible application checks with Node 22:

```sh
npm test
npm run lint
npm run typecheck
npm run build
MYSQL_TEST_DATABASE=tripsync_test npm run test:integration
MYSQL_TEST_DATABASE=tripsync_test npm run test:billing
MYSQL_TEST_DATABASE=tripsync_test node scripts/smoke-browser.mjs --full --mock-providers
MYSQL_TEST_DATABASE=tripsync_test node scripts/verify-billing.mjs
MYSQL_TEST_DATABASE=tripsync_test node scripts/verify-affiliates.mjs
MYSQL_TEST_DATABASE=tripsync_test node scripts/final-verification.mjs --local
```

PowerShell uses `$env:MYSQL_TEST_DATABASE='tripsync_test'` and `npm.cmd`. Never run integration/browser fixtures against a database not ending `_test`, or run them concurrently against the same database because they temporarily change settings. For MariaDB, set MYSQL_HOST/PORT/USER/PASSWORD for the isolated instance in the process environment; do not edit the application's real `.env`.
