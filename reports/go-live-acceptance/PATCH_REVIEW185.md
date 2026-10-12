# Independent patch review — schema 185 working tree

Reviewed candidate: `/Users/nox/.codex/worktrees/go-live-acceptance/HienXaERP`, branch `codex/go-live-acceptance`, HEAD `73c3d172124679ae1bcf6c6cb59b7446efb6a76d` plus the uncommitted source and migrations 180–185. Review date: 2026-10-12. This report records the source state before the root agent's follow-up fixes for the findings below.

**Result: two P2 findings, confirmed by source tracing; runtime release verdict remains Partial.** No database, browser, tests, application, original checkout, deployment, commit, or push was executed by this reviewer. Production source and schema were not edited. Only this report was written.

## Findings

### P2 — Recovered catalog checkboxes do not show the saved intent

Confidence: high, source-confirmed; browser reproduction not executed.

Locations: `src/modules/catalog/editor.tsx:13` introduces catalog booleans into `ReliableCommandForm`; `src/components/reliable-command-form.tsx:64–68` restores only string values; `src/components/reliable-command-form.tsx:130` retries the cached entries.

The new catalog integration includes unchecked/checked fields such as `active`, `sale_enabled`, `purchase_enabled`, and `settlement_allowed`. Recovery iterates only fields present in the saved FormData and sets `input.value`. It never sets `input.checked`, and absent checkbox fields are never processed. The catalog editor supplies no custom restoration callback. A checkbox therefore retains the current record/default state instead of the saved command state.

Concrete reproduction:

1. Open an active warehouse/material editor and uncheck `active`.
2. Submit; allow `save_command_draft` to persist, then interrupt the request before the business RPC commits.
3. Reload the editor. Outcome is UNKNOWN and the saved entries are restored, but the checkbox remains checked from the unchanged active row.
4. Click “Thử lại cùng thao tác”. The retry uses the cached FormData, where `active` is absent, and `saveCatalogAction` converts that absence to `false`.

The receipt payload remains immutable, but the recovered form displays a different state from the command the user is about to replay. The same problem affects sale/purchase/settlement flags and the reverse checked-state case. The minimal fix is to restore checkbox/radio state explicitly, including unchecked fields absent from saved entries, while preserving repeated-field ordering and exact cached retry data. The existing browser evidence covers lost responses after commit for a warehouse name edit, not this unresolved draft with boolean changes.

### P2 — Customer recovery returns a previously saved credit limit after financial read rights are revoked

Confidence: high, source-confirmed; revoke/RPC reproduction not executed by this reviewer.

Locations: `supabase/migrations/20261012081213_recoverable_master_commands.sql:130–134`; payload source `src/modules/catalog/module-page.tsx:24` and `src/modules/catalog/editor.tsx:13`; established read boundary `supabase/migrations/20260925000100_customer_sensitive_column_boundary.sql:48–52`.

The customer editor persists its complete `original` record JSON in the recovery entries, including `credit_limit_vnd` returned by `customer_private_fields`. The new `get_command_draft` checks actor, branch, command, and only the master permission (`customers.manage`) before returning the entire saved payload. The existing private-field reader separately requires current `finance.ar.read` or `finance.ar.adjust` to return a credit limit.

Concrete reproduction:

1. Actor has `customers.manage` and financial read/adjust permission; persist an unresolved customer draft whose `original` JSON contains the credit limit.
2. Revoke both `finance.ar.read` and `finance.ar.adjust`, retaining `customers.manage`.
3. `customer_private_fields` now returns a null credit limit as designed.
4. Calling `get_command_draft` for the actor's same operation/branch still returns the old credit limit verbatim inside `original`, because the recovery gate does not inspect sensitive entries or their current field permissions.

This is a newly introduced recovery read path around an existing field permission boundary, not a cross-actor or cross-branch issue. The minimal fix is to deny retrieval of sensitive drafts when the current actor lacks the required field permission, without rewriting the stored entries or their payload hash. Returning a modified draft would break exact replay and saved-field comparison.

## Other reviewed changes

No additional actionable defect was established in the remainder of the requested diff:

| Requirement/risk | Source evidence | Review conclusion |
| --- | --- | --- |
| New rule/category audit is atomic and does not backfill old rows | Migration 180 replaces the existing receipt trigger, resolves the receipt result's branch, rejects a missing source, and inserts identifier-only audit fields in the receipt transaction | No source defect found; runtime evidence is historical/provided |
| Rate input is finite, in range, and at most six fractional digits | Migration 181 checks the successful receipt before the new rate guard, calls `require_exact_quantity`, rejects unrelated rate fields; action validates exact fixed rates and integer basis points before conversion | No source defect found; no recomputation of old prices/rates |
| Master same-intent retry, actor/branch binding, rollback | Migration 182 serializes by intent; compares actor, command, hash, context branch/kind; canonical validation, receipt, and context insertion share one transaction | No source defect found beyond the field-read finding above |
| Internal canonical captures remain private | Captures preserve function bodies/search paths, redirect the nested profile call to the private canonical catalog function, and revoke PUBLIC/anon/authenticated/service_role EXECUTE | No direct-helper ACL expansion found |
| Existing command draft/outcome behavior remains delegated | Non-master commands delegate to the captured effective functions; migration 183 extends the existing CHECK expression instead of replacing the old command set | No source defect found |
| Exact money transport does not change economic calculations or permissions | Reviewed the 34-file explicit SELECT manifest (63 edits), 9-file wildcard manifest (11 edits), and 3-file source-price/rate manifest; current wildcard lists match their canonical view columns; consumers use string/BigInt/VND formatting; existing branch/permission filters and cost-masking view CASE expressions remain | No source defect found; runtime compatibility was not independently exercised |
| Dashboard JSON money stays exact | Migration 184 changes only the two amount values serialized into `finance_dashboard_detail` JSON to text | No source defect found |
| Assignment receipts obtain their actual source branch | Migration 185 adds `work_item_assignment → work_item_assignments → work_items` lookup before result/verification branches | No source defect found |
| Work command access denial returns 403 | The helper recognizes PostgreSQL `42501`; the three routes pass through `PortalRpcError.code` | No source defect found; other conflict statuses are unchanged |
| Route collision guidance links to editable source | The action recognizes `schedule_collision`; route stops link to their delivery source | No source defect found |

No new opening/activation requirement, price recomputation, fake GPS success, legal e-invoice success, or historical-row update was found in migrations 180–185. The excluded original advance races were not run. `MetaCtx` was not a repository symbol and the parent clarified that no separate path required review.

## Evidence and limits

Read-only commands inspected status/diff, repository AGENTS, bundled Next.js mutation/Route Handler guides, code-verification and supporting skills, effective predecessor migration bodies, query consumers, QA scripts, supplied JSON reports, and supplied test logs. All successful observations here are source observations, not fresh executable acceptance checks.

The provided `NATIVE_FORWARD185.json` and `NATIVE_FRESH_FORWARD185.json` report canonical history 185 and unchanged existing public data. The provided `CLOUD_QA_FORWARD185.json` distinguishes QA history 186 from canonical schema 185. The migration 185 file SHA-256 independently read here is `817a692ce22b7539ea1998556478103af0270231a93ffea038f6969b269eb4e1`, matching those reports. The latest provided native function/view/policy parity report at the time of this review was schema 184, so this review does not claim fresh schema-185 parity.

The supplied unit log records 90 files / 620 passing tests; the later supplied work HTTP log records 2 files / 5 passing tests. The catalog editor tests assert localized choices and submitted enum values with mocked actions, not unresolved boolean restoration or financial permission revocation. Those logs do not establish runtime correctness for this dirty working tree or a fresh integrated CI pass.

Specification/correctness assessment: fail on the two concrete paths above in the reviewed source state. Engineering/runtime release assessment: Partial pending the root agent's repairs and fresh, relevant verification. No broader security checklist or scope expansion is proposed.

## Follow-up source review — checkbox repair

The root agent's subsequent `ReliableCommandForm` patch was reviewed read-only on 2026-10-12. Finding 1 is **addressed by the new source**: recovery now visits every checkbox/radio and sets `checked` from matching saved name/value pairs, including false for fields absent from saved FormData. The generic value loop skips checkbox/radio/file controls, keeps repeated text-field ordering, and leaves cached retry entries unchanged. The new catalog test asserts that an active record plus a draft without `active` renders the recovered checkbox unchecked and disabled. This assertion targets the reported observable behavior and would fail under the earlier restoration loop.

No new concrete defect was found in this patch or its current callers. The supplier-document controlled checkbox caller restores its state through `onRestore`; the patch does not change its saved line payload. Tests/browser checks were still not executed by this reviewer. Finding 2 remains open in this report until the planned field-permission migration is available and reviewed.
