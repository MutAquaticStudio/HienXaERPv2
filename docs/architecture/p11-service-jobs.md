# P11 — Service Jobs

P11 opens `/app/service` for Office and `/work/service` for the assigned operator. A `ServiceJob` owns the customer, site, service type, machine, schedule and commercial rate. P10 `WorkItem` remains a coordination projection: assigning a job creates or updates its operation WorkItem, while starting, ending or cancelling the ServiceJob moves that projection only after the business transition succeeds.

## Execution and billable time

Field execution is append-only in `service_work_logs`:

```text
ASSIGNED → START → IN_PROGRESS → BREAK_START → PAUSED → BREAK_END
                       ├─ FUEL / EVIDENCE / INCIDENT
                       └─ END → COMPLETED
```

The server calculates `actual_minutes` from start to end less completed breaks. Approval writes `approved_billable_hours` and `approved_billable_quantity` separately; it never replaces actual elapsed time. Hourly work requires quantity to equal the approved hours, fixed-job work requires quantity one, and shift/trip/day retain their own commercial quantity.

## Customer confirmation and Finance

The billing boundary is:

```text
COMPLETED → APPROVED → customer confirmation → billing event → receivable → BILLED
```

Confirmation, the billing event, receivable recognition and its ledger entry share one database transaction. Unique indexes on both `service_job_id` and `service_billing_event_id` guarantee one Finance consumer even after retry. Service revenue appears in the Finance receivable list and the service profitability view. Fuel logs and manual direct costs remain traceable to their source; posted P8 expenses allocated to `SERVICE_JOB` are also included.

## Security and verification

Browser clients receive only `SELECT` on RLS-backed tables and `security_invoker` views. Mutations are private functions reached by idempotent server commands. Operators can read and update only assigned jobs; approval, confirmation, cost and scheduling have separate Office permissions.

Verification covers pure lifecycle and command rules, repository contract, PostgreSQL 17 migration smoke through exactly-once Finance, rollback-safe pgTAP, Office and worker mobile accessibility, large text, 48/56px controls, no horizontal overflow, full regression and an exact-SHA Vercel deployment.
