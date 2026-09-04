# P10 — Employee OS and Work Pool

P10 opens `/work`, `/work/pool`, `/work/profile` and `/app/workforce`. The worker surface aggregates assigned work while keeping Delivery controls visible because Delivery remains the business source of truth. The office surface provides the supervisor queue, active-work overview and actionable notifications.

## Lifecycle and ownership

`work_requirements` record why work is needed. `work_items` coordinate execution. Claims, assignments, heartbeats, verifications and state events are separate records so no mutable row pretends to be the full audit history.

```text
AVAILABLE → CLAIMED → IN_PROGRESS → DONE → VERIFIED
                 ├─ BLOCKED
                 ├─ HEARTBEAT_MISSED → UNRESPONSIVE
                 └─ CLAIM_EXPIRED → AVAILABLE
```

P7 readiness events create delivery requirements only after the Delivery command succeeds. Delivery completion or cancellation closes the matching assignment and appends a work state event; P10 never writes a Delivery status as a substitute for the P7 command.

## Atomic claim and capacity

`app_private.claim_work_item` locks the work row before checking `AVAILABLE`, then takes a transaction-scoped advisory lock for the worker before evaluating capacity. This gives exactly one winner for two workers claiming one item and prevents one worker from bypassing active limits by tapping two different items concurrently. A repeated tap by the winning worker returns the existing item without creating a second active claim.

Defaults follow the baseline:

- Driver: one `IN_PROGRESS` plus one future `CLAIMED` delivery.
- Operator: one `IN_PROGRESS`; no additional claim while it is active.
- Claim-to-start lease: 300 seconds.
- Heartbeat cadence: 15 minutes, 60-second response window and 120-second grace.

An `UNRESPONSIVE` item blocks new claims until a supervisor chooses `KEEP_ASSIGNMENT`, `RECALL`, `REASSIGN` or `CANCEL`. Work with a recorded external effect cannot be blindly recalled to the pool.

## Security and verification

Browser clients can only select RLS-backed tables/views. Every mutation function is private and is called by an idempotent server command after checking the actor's permission. Workers can only operate their own work; verification and exception resolution remain supervisor permissions.

Verification includes:

- PostgreSQL 17 migration smoke coverage, including P7 readiness and completion events;
- two-backend claim concurrency and same-worker double-tap proof;
- lifecycle, command validation and repository-order tests;
- pgTAP schema, grants, RLS-facing views, role limits and role-permission assertions;
- worker 375px, large-text, form-error retention, offline status and accessibility tests;
- supervisor desktop queue, consequential-action warnings and accessibility tests;
- full P1–P10 regression and production build in a clean copy.
