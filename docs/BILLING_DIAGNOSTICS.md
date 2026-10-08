# Temporary server-side billing diagnostics

This change records failures only. It does not change configuration, Stripe parameters, prices, schema, fulfillment, frontend behavior, or public error responses. Existing explicit validation errors remain explicit; exceptions previously masked by `paymentError()` still return the identical generic 503.

## Changed files and functions

- `server/billing/diagnostics.js` (new): `setBillingStage`, `billingDiagnostic`, `logBillingError`, and a request-isolated AsyncLocalStorage context.
- `server/billing/router.js`: `safeBilling` establishes the context and logs before forwarding/masking an exception. Logging failures are ignored so they cannot change the response.
- `server/billing/checkout.js`: `createCheckout` marks load_config, validate_billing, validate_plan, load_secret, reconcile_pending, find_or_create_customer, create_checkout_session and save_checkout_session. Existing transaction order and parameters are unchanged. Order-intent and subscription/pending guards are included in reconcile_pending; customer persistence in find_or_create_customer; the final session write and transaction commit in save_checkout_session.
- `server/billing/stripe.js`: `configuredPrice` marks validate_plan, retrieve_price and validate_price without changing validation or calls.
- `server/tests/billing-diagnostics.test.js` (new): privacy, concurrent stage isolation, logging failure, public-response preservation and price-stage tests.
- This document.

## Record format and privacy

One stderr line starts with `[BILLING_ERROR]` followed by JSON containing only:

```text
stage, name, type, code, status, request_id, message
```

Names, types and codes use explicit allowlists. Unknown codes/types are `unclassified`. Only an integer HTTP status and a bounded Stripe `req_…` identifier are accepted. No exception objects, stack traces, request bodies, SQL, response objects, headers, customers, user IDs or keys are logged.

**Raw error.message is deliberately never logged.** It can contain an API credential, customer email, SQL parameter or payment details. Known codes receive a fixed safe explanation (for example resource_missing); all other messages are withheld. Use the stage, error type/status and Stripe request ID to inspect the corresponding request securely in Stripe. A null request_id means the exception supplied no acceptable Stripe request ID; it does not prove whether Stripe was contacted.

## Reproduce after your normal deployment

1. Deploy this diagnostic-only change using your established process and restart the application normally. No deployment was performed by the agent.
2. Sign in with the affected account and click Get Pro Monthly once. Do not complete a payment.
3. Note the time and inspect server stderr for `[BILLING_ERROR]`. If Checkout opens successfully, no failure record is expected.
4. Share only that sanitized diagnostic line for investigation. Do not export environment variables, raw Stripe responses, cookies or payment/customer data.

`console.error` writes to the Node process's **stderr**, not the Admin app_logs table. CloudLinux/LiteSpeed/Passenger decides which file captures it. The repository does not configure an authoritative stderr log filename. Operator scripts identify `/home/tripnexa/apps/tripnexa/runtime/`, but this does not prove that its stderr.log is the live log.

From an SSH terminal, this read-only command searches the account's candidate logs and prints only matching diagnostic lines, with filenames:

```sh
find /home/tripnexa -type f \( -name stderr.log -o -name error_log -o -name '*.log' \) -exec grep -H -F '[BILLING_ERROR]' {} + 2>/dev/null
```

Or from another terminal, replacing SSH_HOST with the actual SSH hostname (and account if different):

```sh
ssh tripnexa@SSH_HOST 'find /home/tripnexa -type f \( -name stderr.log -o -name error_log -o -name "*.log" \) -exec grep -H -F "[BILLING_ERROR]" {} + 2>/dev/null'
```

Once the actual log path is known:

```sh
tail -n 200 -F /actual/path/to/application-stderr.log | grep --line-buffered -F '[BILLING_ERROR]'
```

If none appears, use the hosting panel's configured Passenger/application stderr destination; it may be outside the account directory. The SSH hostname and actual log destination cannot be inferred from this repository.

## Remove afterwards

Remove the `logBillingError(error)` call from the catch in `safeBilling` to stop these diagnostic lines. For full cleanup, remove its diagnostic wrapper/import, the stage calls/imports in createCheckout/configuredPrice, and the diagnostic helper/tests. Restore `configuredPrice`'s equivalent single expression if desired. Do not revert unrelated pending checkout fixes or other working-tree changes. Already written records follow the hosting provider's normal log retention; this change does not delete logs.

## Local verification

Tests use synthetic exceptions and Stripe fixtures only. No LIVE Stripe access, secret changes, configuration changes, commit or deployment.
