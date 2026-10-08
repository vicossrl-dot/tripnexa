# Pending Checkout reconciliation

## Findings and changes

The actual schema uses `billing_orders`, with `id`, `user_id`, `mode`, `plan_code`, `kind`, `status`, `request_key`, `checkout_id`, `customer_id`, `price_id` and the existing payment fields. The established local cancellation spelling is **`canceled`**, which is preserved (no parallel `cancelled` state).

Open-session expiration and `checkout.session.expired` handling already existed. The defects were incomplete reconciliation:

- `cancelCheckout()` rejected a completed Stripe session without reconciling a confirmed payment, leaving the local order pending when its webhook had not completed.
- The pending-order guard used local state before retrieving the Stripe session, so stale orders could block switching plans.
- Expiry reconciliation unnecessarily required retrieving line items before updating an expired order.
- A stored browser request key could lead a new purchase attempt back to a terminal canceled/failed order.

Changes:

- `server/billing/checkout.js`: reconcile pending sessions before applying the purchase guard. Commit that reconciliation independently so a subsequent guard rejection cannot roll back confirmed payments or expiry. Cancellation expires an open session, handles an expiry/completion race by retrieving current state, and uses existing fulfillment under the user/order locks. Already terminal orders are idempotent.
- `server/billing/webhooks.js`: share the existing transaction-level fulfillment with checkout reconciliation, verify mode, and process expiry before line-item retrieval. Confirmed complete/paid sessions still use the existing price validation, subscription sync and exactly-once credit grant logic. Expired sessions only cancel pending orders; paid orders are not downgraded.
- `src/components/billing/Billing.jsx`: if a stored request key returns canceled/failed, generate a fresh key and retry once. Pending and paid responses retain their existing behavior.
- `server/tests/billing-integration.mjs`: regression cases for open cancellation, duplicate cancellation, ownership, expired/duplicate webhooks, paid completion, expiry races, lost expiry responses, provider failure, unpaid asynchronous payment and stale-order guards. Fixture-only users that need no HTTP session no longer perform unnecessary logins, keeping the expanded suite within the real login rate limit.

A `complete` session with `payment_status=unpaid` is not automatically canceled: asynchronous payment can still settle. It remains protected until Stripe confirms payment/failure. Orders without a session ID also retain the existing reconciliation protection; an ambiguous remote creation must not be blindly canceled or duplicated.

Stripe and SQL cannot participate in one distributed transaction. The local transition is transactional; if Stripe expiry succeeds but the database commit fails, retry or the expiry webhook observes the expired session and completes the local update. See [Stripe session expiration](https://docs.stripe.com/api/checkout/sessions/expire).

## Targeted one-time cleanup of the two test purchases

Added `scripts/reconcile-pending-test-checkouts.mjs`. This is a data-reconciliation tool, not a DDL migration. It does not delete orders, change IDs/prices, blanket-update pending records, or touch storage. It requires exactly two explicit IDs belonging to one user, with plans `PRO_MONTHLY` and `TRIP_PACK_5`, both in test mode with matching Stripe session/customer/metadata. The active billing mode must already be test. Do not switch a live deployment's billing mode to run it.

Find the correct IDs through this read-only query, restricted to the affected user's actual ID:

```sql
SELECT id, user_id, mode, plan_code, status, checkout_id, created_at
FROM billing_orders
WHERE user_id = '<affected-user-id>'
  AND mode = 'test'
  AND status = 'pending'
  AND plan_code IN ('PRO_MONTHLY', 'TRIP_PACK_5')
ORDER BY created_at;
```

With the existing database and Stripe test credentials available to the server process:

```sh
node scripts/reconcile-pending-test-checkouts.mjs ORDER_ID_1 ORDER_ID_2
```

This reads the exact orders and their current Stripe sessions and prints a sanitized dry-run plan. After reviewing the two IDs/actions, apply:

```sh
node scripts/reconcile-pending-test-checkouts.mjs ORDER_ID_1 ORDER_ID_2 --apply
```

Open sessions are expired and canceled; already expired sessions are canceled locally. A completed paid session is reconciled as paid through the normal fulfillment path, never mislabeled canceled. Unresolved payments stop the preflight. Both orders are preflighted before applying; each is then processed in its own transaction with a fresh Stripe lookup. If the second fails after the first succeeds, rerun the same IDs safely. Existing paid/refunded/canceled orders are left intact.

**Not executed against production.** The actual two order IDs and their Stripe states were not available in this workspace. The screenshot alone cannot establish whether either payment completed. No production data was deleted or altered.

## Verification

- Lint, typecheck, 81 unit tests and production build passed; existing large-chunk warning remains.
- Billing MySQL suite passed 22 tests with synthetic Stripe sessions; all 60 MySQL integration tests passed. The billing Chrome regression passed all 13 checks with no unhandled browser exceptions.
- No live Stripe payment or production cleanup was performed. No deployment or commit.
