# P5 — Supplier Orders, Sourcing and Dropship

P5 adds `/app/sourcing` as the bridge between confirmed Sales Order requirements and a concrete supply plan. It can split one Sales Order line across internal warehouse stock, supplier-direct delivery and supplier-to-warehouse purchasing. Inventory movements, delivery confirmation and AP remain locked to later phases.

## Split sourcing and route safety

Every `supply_allocations` row links both `fulfillment_requirements` and `sales_order_lines`. Allocation creation locks the Sales Order line and checks the current non-cancelled sum before insert, preventing concurrent plans from exceeding ordered quantity.

The database enforces three mutually exclusive routes:

```text
WAREHOUSE             → warehouse required, supplier/customer site empty
SUPPLIER_DIRECT       → supplier + real customer/site required, warehouse empty
SUPPLIER_TO_WAREHOUSE → supplier + warehouse required, customer/site empty
```

Supplier-direct rows therefore cannot masquerade as warehouse receipts. P5 contains no inventory movement insert. It stores `supplier_delivered_qty`, `customer_accepted_qty` and `customer_billable_qty` separately with an ordered quantity chain; later delivery/finance phases own the commands that post those actuals.

## Supplier prices and Purchase Orders

`supplier_price_history` is effective-dated and versioned. Existing commercial fields are immutable; a current version may only be closed before a new version is inserted. `purchase_cost_snapshots` copy supplier, material, UOM, price, currency and source version at Purchase Order creation. Purchase Order lines and cost snapshots cannot be updated or deleted.

The Purchase Order state machine is:

```text
DRAFT → CONFIRMED → SENT → ACKNOWLEDGED → PARTIALLY_DELIVERED → DELIVERED
   └────────────── cancellable before terminal completion ──────────────┘
```

`app_private.transition_purchase_order` locks the order, checks actor permission and line existence, applies one legal transition and appends immutable transition evidence. Confirmation or sending does not create AP, supplier debt, warehouse receipt or inventory movement.

`purchase_order_evidence` links private P1 evidence metadata to an order without exposing object URLs or granting browser write access.

## Security and verification

All eight P5 tables use RLS. Browser roles receive SELECT only; mutations remain guarded server commands with permissions, idempotency, transaction and audit. Private transition functions are revoked from `public`, `anon` and `authenticated`.

Verification covers:

- split allocation and oversourcing rejection;
- dropship customer/site requirements and absence of a fake warehouse;
- immutable supplier-price and purchase-cost snapshots;
- legal Purchase Order transitions with no AP creation;
- distinct supplier-delivered, customer-accepted and customer-billable quantities;
- hosted acceptance in `supabase/tests/p5_sourcing_dropship.sql`;
- desktop/mobile Playwright flows, serious accessibility checks and 375px overflow checks.
