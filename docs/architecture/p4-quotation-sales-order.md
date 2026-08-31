# P4 — Quotation and Sales Order

P4 adds `/app/sales/orders` as the controlled path from a commercial proposal to a confirmed Sales Order. It stops at fulfillment requirements: sourcing, inventory, delivery and AR remain locked to later phases.

## Quotation revisions

`quotations` is the stable commercial identity. Each change after sending creates a new `quotation_revisions` row; the sent revision becomes `SUPERSEDED` but is never rewritten. A revision can move from `DRAFT` to `SENT`, then to `ACCEPTED` or `SUPERSEDED`. Database triggers reject line changes once its revision leaves `DRAFT`.

Draft-only price refresh resolves each material again against the P3 price hierarchy and creates a new immutable `selling_price_snapshots` row. A requested price below the resolved price requires `price.override`, a reason of at least ten characters and an immutable `price_approval_events` record. UOM identity and display data are copied into JSON/text snapshots so later master edits do not alter historical documents.

## Sales Order boundary

Only an `ACCEPTED` quotation revision can be converted. `sales_order_lines` copy quantity, price, UOM, material and source snapshot identifiers from that exact revision and cannot be updated or deleted.

The order state machine is:

```text
DRAFT → CREDIT_BLOCKED | CONFIRMED | CANCELLED
CREDIT_BLOCKED → CONFIRMED | CANCELLED
CONFIRMED → FULFILLING | CANCELLED
FULFILLING → COMPLETED | CANCELLED
```

`app_private.confirm_sales_order` executes permission resolution, state guard, credit evaluation, optional controlled override, transition evidence, exposure update and fulfillment creation in one transaction. It creates one `fulfillment_requirements` row per order line with `PENDING_READINESS`. It does not create a Work Item, inventory movement, delivery, receivable or AR ledger entry.

## Security and verification

All eight P4 tables use RLS. Browser roles receive SELECT only; writes remain authenticated server commands with live-write guard, idempotency, transaction and audit. Private functions have no execution grant for `anon` or `authenticated`.

Verification covers:

- draft-only price refresh and locked sent/accepted revisions;
- exact price/UOM snapshot conversion into Sales Orders;
- price and credit override permission/reason controls;
- order state transitions and fulfillment requirement creation;
- regression that SO confirmation does not create AR;
- hosted PostgreSQL acceptance in `supabase/tests/p4_quotation_sales_order.sql`;
- desktop/mobile Playwright flows, serious accessibility checks and 375px overflow checks.
