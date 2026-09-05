# HIỀN XA ERP

P1 provides the platform/security foundation, P2 adds construction master data, P3 adds Customer 360 and commercial controls, P4 adds versioned quotations plus guarded Sales Orders, and P5 adds supplier sourcing, purchase orders and dropship. The modular monolith uses Next.js, TypeScript, Vercel and exactly one hosted Supabase project in the Production role.

## Local development

Requirements: Node.js 22+ and pnpm 11. Local work must never use the hosted Production database.

```bash
cp .env.example .env.local
pnpm install
ALLOW_LOCAL_SYNTHETIC_AUTH=true pnpm dev
```

Synthetic authentication renders the protected shells with fake local identities and is rejected in Production. Local development and CI do not require Docker or a local Supabase runtime.

The hosted architecture is:

- GitHub runs lint, type checking and tests for each checkpoint.
- A push to GitHub runs the full checkpoint build in GitHub Actions. Vercel Production deployment remains a separate explicit action after the phase checkpoint.
- Exactly one Supabase Cloud Production project provides PostgreSQL, Auth and private Storage.

Do not link the local CLI to the hosted project during routine phase work. Hosted Supabase migrations remain a separate, explicit deployment action.

## Phase 2 invariants

- Packaging conversions belong to a material; there is no global `1 bag = 50 kg` rule.
- Every conversion version points to its material base UOM, preventing conversion cycles by construction.
- `EXACT`, `PACKAGING`, `ESTIMATED` and `MEASURED` remain visible in the UI; estimates are explicitly disclosed.
- Conversion versions and transaction snapshots are immutable. A used UOM is deactivated, never deleted.
- Vehicle load profiles are planning capacity and are not universal UOM conversions.

See [the P2 architecture note](docs/architecture/p2-master-data-uom.md) for the data model and verification evidence.

## Phase 3 invariants

- Price resolution is deterministic: customer + material, customer + material group, customer tier, then default material price.
- Price rules and credit policies are effective-dated immutable versions; overlapping periods are rejected.
- Selling-price snapshots preserve the historical amount, UOM and source rule version.
- Customer advances remain separate from receivables in every credit and finance read model.
- Sales can read credit status but cannot bypass a block without explicit permission. Every override needs a meaningful reason and immutable audit evidence.

See [the P3 architecture note](docs/architecture/p3-customer-360-pricing.md) for the data model and verification evidence.

## Phase 4 invariants

- Price refresh is draft-only. Sent and accepted quotation revisions are immutable.
- A below-rule selling price requires explicit `price.override`, a meaningful reason and immutable approval evidence.
- Only the exact accepted revision converts to a Sales Order; price and UOM snapshots remain frozen.
- Confirmation performs a credit check and requires controlled override for a block.
- Confirmation creates fulfillment requirements, not Work Items, inventory movements, deliveries or AR.
- `SALES ORDER CONFIRMED != CUSTOMER OWES MONEY` remains a database-tested invariant.

See [the P4 architecture note](docs/architecture/p4-quotation-sales-order.md) for the state machines, transaction boundary and verification evidence.

## Phase 5 invariants

- Every supply allocation links to one Sales Order line and supports split sourcing without exceeding ordered quantity.
- `WAREHOUSE`, `SUPPLIER_DIRECT` and `SUPPLIER_TO_WAREHOUSE` have mutually exclusive route requirements.
- Supplier-direct delivery stores the real customer/site and never creates a fake warehouse movement.
- Supplier prices are effective-dated immutable versions; every Purchase Order line references an immutable purchase-cost snapshot.
- Supplier delivered, customer accepted and customer billable quantities remain three separate values.
- Purchase Order confirmation and sending create no AP, payable or inventory ledger entry.

See [the P5 architecture note](docs/architecture/p5-sourcing-dropship.md) for the sourcing routes, Purchase Order state machine and verification evidence.

## Phase 10 invariants

- Delivery and ServiceJob remain the business sources of truth; WorkItem coordinates execution only after the business command succeeds.
- A claim locks the work item and serializes worker-capacity checks. Two workers cannot win the same item, and a double-tap by one worker creates no duplicate claim.
- Driver and operator active-work limits, the five-minute start lease and heartbeat windows are explicit database policy.
- Unresponsive workers cannot claim new work until a supervisor resolves the exception.
- Work with external side effects is never blindly returned to the pool.
- Worker mutations are server-only commands; browser reads remain RLS-scoped.

See [the P10 architecture note](docs/architecture/p10-employee-os-work-pool.md) for the work lifecycle, concurrency boundary and verification evidence.

## Phase 11 invariants

- ServiceJob is the source of truth; its P10 WorkItem is only an execution projection.
- START, breaks, fuel, evidence, incidents and END are immutable operational logs.
- Actual elapsed hours never overwrite approved billable hours or billing quantity.
- Customer confirmation creates one billing event, one receivable and one recognition ledger entry in one transaction.
- Job profitability includes direct service costs and posted Finance expenses allocated to that ServiceJob.
- Operators can update only assigned jobs; Office scheduling, assignment, cost, approval and confirmation remain separate permissions.

See [the P11 architecture note](docs/architecture/p11-service-jobs.md) for the execution lifecycle, billing boundary and verification evidence.

## Phase 12 invariants

- Compensation plans are effective-dated immutable versions. Resolution is deterministic: employee override, role plan, then company default.
- A worker reporting `DONE` never creates payable earnings. A verified WorkItem and a matching effective rule are both required.
- Every earning allocation snapshots the selected plan, rule, rate, units and worker; multi-worker shares must reconcile to 100% or the verified units.
- Approval records entitlement only. P8 Payments remains the cash ledger, and payroll links never create or repost money.
- Adjustments and reversals are additive audit records or explicit state changes; historical snapshots are never overwritten.
- Variable earnings attributable to a delivery or ServiceJob feed direct labor. Fixed monthly salary, bonuses and manual adjustments do not.
- Worker reads are self-scoped and read-only; all payable earning mutations remain server commands.

See [the P12 architecture note](docs/architecture/p12-compensation-productivity.md) for plan resolution, earning/payroll boundaries and verification evidence.

## Verification

### Module navigation and read deadlines

- Office navigation shows a pending label immediately and streams a loading state. Module errors keep the sidebar available; retry refreshes server data.
- Snapshot reads use an isolated read-only transaction with a 15-second statement timeout, a 5-second lock timeout, and a 45-second overall connection/read deadline. A deadline closes only that read connection. The write/idempotency connection is separate.
- At most four read connections run concurrently per process. Additional reads wait at most five seconds before returning a busy error. This is a per-process bound, not a fleet-wide database connection cap.
- Server Supabase HTTP requests have a 15-second timeout including response-body consumption. Principal resolution is memoized only within the current React request.
- Sales, Master Data and Sourcing load the selected tab through `?tab=...`. Lists use 50-record UUID cursor pages (`?after=...`); related rows follow the selected parents without truncating individual order lines, allocations, credit policies or price rules. Counters explicitly describe the displayed page. Master Data pages materials; other lookup catalogs remain complete when the selected tab needs them.
- Delivery loads lines only for its displayed deliveries. Route planning, GPS and chat stream separately, so an optional panel failure does not remove the main workspace.
- `read.start`, `read.success` and `read.error` logs include module, operation, read ID, duration and row count/error code. `database.connection` reports the connection mode and port. Logs exclude SQL parameters, credentials and raw database error messages.
- Check `database.connection` in production for `transaction-pooler` on port `6543`. Obtain the exact endpoint from the project's Supabase Connect panel; do not guess a hostname or change ports blindly. Transaction-local settings and `prepare: false` support transaction pooling.
- Use [read-only database diagnostics](scripts/diagnose-module-reads.sql) in the correct Supabase project to inspect plans and existing indexes before proposing a migration. Repository migrations already contain several relevant foreign-key indexes. No speculative index or hosted schema change is included in this fix.

Production pooler configuration and query plans cannot be verified through the current Supabase connector: its account does not list the Hiền Xa project. Vercel CLI can access the project but does not export its Secret `SUPABASE_DB_URL`; do not copy that secret into a local environment file. Runtime logs and the project's SQL Editor are the remaining verification paths.

```bash
pnpm verify
```

Recent checkpoint change:

- `src/app/globals.css`: responsive fix for Office sidebar (`/app` shell) so mobile navigation is not hidden and remains scrollable.

To publish this exact checkpoint to Vercel Production, run:

```bash
pnpm dlx vercel@latest --prod
```

Automatic Vercel Git deployments are disabled in `vercel.json` so a checkpoint cannot publish application code before its reviewed schema. Applying hosted Supabase migrations and deploying the exact checkpoint SHA to Vercel Production always require a separate explicit instruction.
