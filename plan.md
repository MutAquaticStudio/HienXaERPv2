# plan.md — Audited Recovery Plan

> **DOCSET:** `HX-V2-DOCSET-4.4`
> **SYNC:** `SYNC-4.4`
> **Canonical files:** Spec.md, UXUI.md, plan.md, tasks.md, implementation.md

# PLAN-000 — Goal

```text
GA mandatory audit
→ GC gap closure R3–R9
→ R10
→ R11
→ R12
```

Không đi thẳng R10.

# PLAN-005 — Mandatory audit gate

GA chạy read-only trên exact HEAD.

Pass khi:
- 23 known gaps đều có verdict + evidence;
- route/module/schema map đủ;
- false positives được DISPROVED;
- NEW_GAP được thêm nếu thấy.

Không dùng commit message hoặc old `IMPLEMENTED` làm bằng chứng đủ.

# PLAN-010 — Audit evidence

Matrix:
```text
contract
→ observable behavior
→ route/page/form
→ command/RPC
→ schema/migration
→ verdict
```

Không cần browser screenshot để kết luận source feature missing.
Browser/manual UX audit để QA sau.

# PLAN-015 — No re-audit

Sau GA:
- reuse evidence;
- fix chỉ invalidate gap/source/check liên quan;
- không full repo scan lại;
- không re-audit RLS/schema toàn hệ thống trừ trigger;
- GC gate chỉ kiểm gap delta.

# PLAN-020 — Token strategy

Session bootstrap:
- SPEC-DOC + SPEC-GAP + SPEC-REC + SPEC-ARCH;
- UX-930;
- PLAN;
- TASK-010 + task active;
- relevant IMP gap record.

Sau đó:
- không full-read 5 file mỗi task;
- source path có evidence → fetch trực tiếp;
- PASS còn valid → REUSE;
- batch output ngắn.

# PLAN-025 — Architecture lock

Giữ modular monolith, function-first, explicit FK, single DB transaction.
Không microservices/event bus/saga/CQRS infrastructure/generic repository/workflow engine/premature cache/queue.

# PLAN-030 — Phases

## GA — Read-only Gap Audit
GA-A reality/document sync.
GA-B commercial/master-data.
GA-C fulfillment/finance/portal.
GA-D system features/R10–R12.
GA-E final gap register.

## GC — Gap Closure
GC-A document + shell/discoverability.
GC-B master data/settings.
GC-C commercial documents.
GC-D fulfillment multi-line.
GC-E workspaces/access/portal.
GC-F lists/dashboard.
GC-G missing system features.
GC-H closure gate.

## R10
Routing + RoutePlan + GPS + Messaging + UI.

## R11
Invoice domain + provider-neutral UI + optional provider/job integration.

## R12
Actual migration/release case + rehearsal + reconciliation + release QA + recovery + cutover authorization.

# PLAN-035 — GC Gate before R10

R10 locked until:
- open P0 = 0;
- core P1 fixed or Owner-deferred;
- current docs sync HEAD;
- core list bounded;
- Sales/PO/Delivery multi-line contract satisfied;
- real actor/branch shell.

# PLAN-040 — Checks

No smoke test.

Use:
DOC/UI/UNIT/DB/SEC/IDEM/RACE/PERF/EXT/MIG/GATE.

Task: cheap focused feedback.
Batch: union checks once.
Phase: invalidated checks only + build/typecheck when needed.
Money/inventory/permission/concurrency primitive cannot rely only on code inspection.

# PLAN-045 — R10 rules

One route provider only.
Route recommendation != assignment until Apply.
GPS foreground active assignment only.
Messaging DB authoritative; realtime is refresh signal.
Internal/customer audience separate.

# PLAN-050 — R11 rules

Provider decision is human gate.
Provider-neutral invoice domain may proceed before provider selection.
One durable job mechanism only if external async requires.
Timeout = UNKNOWN → reconcile before retry.
Invoice issue does not create AR again.

# PLAN-055 — R12 rules

First determine actual migration case.
If legacy Production data no longer exists, record `NO_LEGACY_DATA_TO_MIGRATE`; do not invent migration.
Production mutation/cutover requires separate Owner authorization.

# PLAN-060 — Git

No force push/reset.
Coherent batch commits.
Before push verify deploy guard.
No Production mutation by prompt implication.

# PLAN-065 — Output

```text
LOG
scope=
state=
gap_delta=
changed=
checks=<NEW/RERUN/REUSED>
blocker=
production=NOT_TOUCHED

DoD
doc_conformance=
implementation=
next=
```

# PLAN-070 — Completion

Implementation complete when:
- GA complete;
- GC complete;
- R10 complete;
- R11 provider-neutral complete, provider blocker explicit if any;
- R12 non-Production scope complete;
- unresolved human gates explicit.
