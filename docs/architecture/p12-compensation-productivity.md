# P12 — Compensation and productivity

P12 opens `/app/compensation` for Office and `/work/earnings` for workers. It records what a worker is entitled to receive from verified work, builds immutable payroll-period snapshots and links those snapshots to cash movements already posted by P8 Finance. It does not create a second cash ledger.

## Effective plans and resolution

A compensation profile identifies the effective employment window. A plan version targets exactly one scope: company, role or employee. Rules cover fixed monthly amounts, job/trip/hour/shift/day and construction quantities, gross-profit percentages, bonuses and adjustments.

Resolution on the earning date is deterministic:

```text
employee override → matching role plan → company default
```

The chosen profile, plan version, rule, rate and approved units are copied into each allocation. Later plan versions therefore cannot rewrite historical earnings.

## Earning boundary

The work-based lifecycle is:

```text
WorkItem DONE → supervisor VERIFIED → resolve rule → allocate → PENDING_APPROVAL
                                                        ↓
                                         approve → APPROVED entitlement
```

`DONE` alone is insufficient. The database requires both the verified WorkItem state and its immutable verification record. A multi-worker event accepts either percentages totaling exactly 100% or approved units totaling the verified basis. Fixed salary, bonuses and manual adjustments never enter attributable direct labor. Approved variable allocations for a Delivery or ServiceJob do, and source cancellation reverses those entries without deleting history.

## Payroll and cash

An open payroll period can generate fixed-monthly entitlements using the plan effective on its end date. All pending entitlements in the period must be resolved before close. Close copies each approved allocation into an immutable employee line.

A payroll payment link points to an existing posted or reconciled P8 disbursement. It is bounded by both the employee line and the cash movement and never updates, creates or reposts the P8 Payment. “Approved entitlement” and “paid cash” consequently remain separate values in both Office and Worker read models.

## Security and verification

Authenticated browser roles receive `SELECT` only on RLS-protected tables and `security_invoker` views. Office commands are private database functions behind authenticated, authorized and idempotent Server Actions. Workers receive only `earning.read_self`; their repository query and RLS policy both bind reads to `auth.uid()`.

Verification covers command parsing, plan precedence, allocation math, repository contracts, a real PostgreSQL 17 migration flow, rollback-safe pgTAP, desktop/mobile/large-text/200%-equivalent layouts, keyboard focus, 48/56px targets, no horizontal overflow and serious/critical axe violations.
