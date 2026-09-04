# A1 — Final cross-flow consistency audit for Portals Add-on

**Baseline audited:** P1–P12 plus WP1, CP1, RO1, GPS1 and CHAT1.
**Scope:** source contracts, PostgreSQL migrations, embedded PostgreSQL integration tests, Playwright portal tests, and rollback-safe pgTAP assertions against the configured Supabase Production schema.
**Deployment model:** GitHub `main` → Vercel Production and Supabase SQL Editor only. No Docker, no Supabase branch/staging, and no direct Production database CLI.

## Final finding and remediation

| ID | Finding | Canonical owner | Resolution |
| --- | --- | --- | --- |
| A1-01 | CP1 checked membership and exact revision, but its adapter directly wrote P4 quotation status. That left quotation acceptance portal-owned instead of a reusable core transition. | P4 Commercial | `app_private.accept_quotation` is now the security-invoker P4 transition. CP1 keeps customer authorization, retry/idempotency and audit, then calls the shared transition. The adapter no longer updates `quotations` or `quotation_revisions` itself. |

No historical delivery, finance, work, earning, route, GPS, or chat record is rewritten by this remediation.

## Canonical ownership after A1

| Object / transition | Authoritative source | Add-on role | Boundary confirmed |
| --- | --- | --- | --- |
| Quote revision acceptance | P4 `accept_quotation` | CP1 authorizes the exact member-owned active revision and records consent/audit | Customer retry does not create another consent or Sales Order; browser has no direct write grant. |
| Sales Order, sourcing and inventory | P4/P5/P6 | CP1 only projects the customer-owned order; WP1 receives assigned delivery/work | `SUPPLIER_DIRECT` remains outside warehouse inventory movement. |
| Delivery proof, actual, confirmation | P7 | WP1 supplies field workflow; CP1 projects actual/accepted quantities; RO1 assigns through P7 | Route, GPS, issue and chat cannot confirm or overwrite Delivery. |
| Work claim and verification | P10/P11 | WP1 projects eligible/assigned work only | Claim is locked/idempotent; completion and verification remain separate. |
| AR, payment and customer debt | P8 | CP1 submits a non-authoritative payment notice and projects derived debt | Notice cannot create `payments`, allocations, or change `receivables`. |
| Earnings and payroll | P12 | `/work/earnings` is self-only | `create_verified_work_earning` requires a VERIFIED work item plus verification evidence. |
| Route recommendation | RO1 `route_plans` | Dispatcher reviews/applies recommendation | Applying delegates to P7 `assign_delivery`; POOL_CLAIM is rejected without an explicit workflow. |
| Active delivery location | GPS1 ping/current-location | Driver submits only own active assignment; dispatch uses fleet projection | Ping writes telemetry only, becomes stale/offline visibly, and does not change Delivery state. Customer projection carries progress/ETA wording only, never exact coordinates. |
| Operational conversation | CHAT1 PostgreSQL Message | Realtime is post-commit transport and refresh signal only | Active participant + currently authorized source context + OPEN status are required. Message text cannot execute business commands. |
| Portal issue | WP1/CP1 support record | Captures a reference and immutable report | Reporting never changes its Delivery, WorkItem, or ServiceJob source without a separate core command. |

## Scenario evidence

| Scenario required by addon baseline | Evidence / regression seam | Status |
| --- | --- | --- |
| 1. Warehouse order through earning | P4/P5/P6/P7/P10/P12 workflow, repository-contract and browser suites; work verification is the earning precondition | Confirmed in fresh automated suites |
| 2. Supplier direct | P5 workflow and pgTAP prove direct sourcing captures supplier/customer quantities without `inventory_movements` | Confirmed |
| 3. Concurrent worker claim | P10 deterministic two-session concurrency test | Confirmed |
| 4. Customer quote acceptance | CP1 embedded PostgreSQL test now proves member/exact-revision authorization delegates to P4 `accept_quotation`; A1 pgTAP prohibits direct P4 state writes in CP1 | Confirmed after A1 remediation |
| 5. Customer payment notice | CP1 integration/contract test and A1 pgTAP prove notice is separate from P8 payment/allocation/debt | Confirmed |
| 6. Route optimization | RO1 planner/contract/browser tests and A1 pgTAP prove `assign_delivery` delegation, apply guard and POOL_CLAIM rejection | Confirmed |
| 7. Active GPS tracking | GPS embedded PostgreSQL, contract and browser tests prove assignment-derived ping, terminal stop, stale status and customer-safe projection | Confirmed |
| 8. Chat | CHAT1 embedded PostgreSQL test proves durable idempotent message, loss of access after assignment, closure, direct-write denial and unchanged Delivery; browser suite verifies server-confirmed mobile flow | Confirmed |
| 9. Payment reversal | P8 workflow/repository tests retain payment ledger as the source for customer debt/history projection | Confirmed by P8 regression suite |
| 10. Delivery variance and dispute | P7/CP1 repositories read the same `delivery_actuals`; customer issue is a separate support record and does not change actual/accepted quantity | Confirmed by contract and browser suites |
| 11. Service job to earning | P11/P12 workflow tests require service/work verification before entitlement/earning | Confirmed |

No synthetic test creates a Production business transaction. The live database assertion is transactional and ends with `ROLLBACK`; this deliberately preserves the existing ledger and operational history.

## A1 programmatic assertions

`supabase/tests/a1_cross_flow_consistency.sql` checks the deployed schema in a rollback-safe transaction:

- the final support aggregates exist with RLS and browser direct writes closed;
- CP1 delegates quote acceptance to the canonical P4 command;
- RO1 delegates to P7 and cannot bypass POOL_CLAIM safeguards;
- GPS, payment notices, PortalIssue and CHAT1 do not mutate their core transactions;
- P12 earning remains contingent on verification evidence;
- current authorization still protects exact GPS and conversation reads.

`tests/a1/core-command-boundary.test.ts` is the source-level regression guard for the same command boundaries. `tests/customer-portal/migration-smoke.test.ts` uses PostgreSQL 17 embedded to prove the CP1 adapter invokes the A1 P4 transition, preserves idempotency and leaves Sales Order, receivable, payment and DeliveryActual invariants intact.

## Security and privacy matrix

| Persona | May access | Must not access | Enforcement |
| --- | --- | --- | --- |
| Worker / driver | Own assigned delivery, work, service job, self earnings, own active location, authorized chat | Purchase cost, margin, finance, other workers, other customers | RLS plus server-derived assignment/actor checks |
| Customer member | Own quotes/orders/deliveries/debt projection, own notices/issues, authorized support chat | Other customers, supplier/internal costs, margin, finance totals, employee directory, raw GPS, private evidence | Membership mapping, scoped read model, RLS, private storage policies |
| Dispatcher / supervisor | Authorized routes, fleet projection, assigned operational chat | Customer finance/margin unless independently permitted | Explicit capabilities and context checks |
| Browser client | Read projections permitted by RLS | Direct writes to core and add-on operational tables | Grants revoked; commands are server-side security-invoker functions |

## Release gate

The add-on is eligible for final release only when the following are green for the same checkpoint SHA:

1. lint, TypeScript, unit/integration, all portal E2E and production build;
2. GitHub Actions checkpoint verification;
3. Supabase A1 migration applied through SQL Editor and A1 pgTAP passes with rollback;
4. Vercel Production deployment is READY and `/api/health` returns database-reachable `ok: true`.

`P1` user-owned evidence remains outside the A1 commit and is never overwritten by test execution.
