# QA runbook

Status: PREPARED; cloud execution requires a separate QA project. No human observation has been recorded.

## Environment

Supabase Dashboard currently blocks creation because both Free slots are occupied by HienXaERPv2 and nox-os-preview. The owner must release a slot or provide another QA environment. Do not pause or repurpose another application's project implicitly.

Create HienXaERPv2-QA in ap-northeast-2. Populate ignored `.env.qa.local` using `qa/environment.example`, with credentials from that project only. Use a unique QA password with at least 20 characters. Never reuse the production owner's password. The owner must rotate the previously shared production password privately.

Use a verified direct database or session-pooler connection. `DATABASE_URL` must select database postgres and match the QA ref. CLI migration additionally needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` in the ignored environment file. The migration command never uses the persisted project link.

Run `pnpm qa:guard`, `pnpm qa:migrate`, `pnpm qa:seed`, then start the application with only the QA environment loaded. For example: `node --env-file=.env.qa.local node_modules/next/dist/bin/next dev`. For Preview, bind all QA variables to the QA branch only; do not alter Production variables. Install Chromium with `pnpm exec playwright install chromium` before browser checks.

Default seed: 10 customers, 20 sites, 100 draft orders, 500 lines, 150 planned deliveries, 200 opening AR/AP obligations, 200 allocated payments, 100 draft expenses, 200 draft earnings, two sent quotes, two branches, assigned worker work and six Auth personas. Increase `HX_QA_BATCHES` to scale complete batches up to 100. The capacity guard rejects writes at the safety ceiling and rolls back the transaction. This is a partial synthetic profile: delivery supply lines and completed operational lifecycles are not represented, and messages are not implemented. It is not full SPEC-PERF-004 representative/expanded coverage.

`pnpm qa:cleanup` requires `HX_QA_CLEANUP_REF` and revokes seeded actors while preserving business/audit history. It does not delete financial records or reset QA. Re-seeding does not reactivate revoked accounts; review their state deliberately before another run.

## Technical checks

Run `pnpm qa:test` locally, `pnpm qa:uat:technical` and `pnpm qa:storage` against QA. Each cloud command checks the application's QA fingerprint before browser actions. Storage expiry deliberately takes more than one minute. Artifacts contain synthetic IDs and timings, never passwords, tokens or signed URLs.

Run `pnpm qa:perf` only against QA. It measures browser click-to-content, the access API, a finance dashboard RPC and finance-account creation at concurrency 1/5/10, with at least 100 samples per path. Account creation leaves namespaced QA records for cleanup. API server timing covers access resolution; RPC timings include network round trips. It retains errors and slow samples. First navigation is labeled separately; it does not claim a cold server reset. Performance targets remain exclusively in Spec.md, referenced by SPEC-PERF-002/004.

Technical UAT remains PARTIAL until recovery email delivery, full field/payload auditing and the human scenarios below are observed. Automated success does not replace human acceptance.

## Three-person observation

Record tester initials, timestamp, candidate SHA, browser/device, fixture IDs, elapsed task time, assistance needed, observed outcome and evidence path. Keep real tester identities and passwords outside Git. Use synthetic fixtures only. Every row starts NOT_RUN and must be explicitly signed by the observer.

| Observer | Cases | Journey | Initial result |
|---|---|---|---|
| A | ACC-CASE-03/04 | Owner: select both branches; verify sales cannot see cost/profit/payroll; revoke sales access and retry API/file | NOT_RUN |
| A | ACC-CASE-22 | Finance: inspect debt, review a payment notice; verify the notice itself does not reduce debt | NOT_RUN |
| B | ACC-CASE-03/21 | Worker: open assigned work, enter result, lose network during upload, retry without losing form or duplicating operation | NOT_RUN |
| B | ACC-CASE-03/04 | Logout worker, use same browser as sales; inspect back navigation, cookies/cache/local drafts | NOT_RUN |
| C | ACC-CASE-04/22 | Customer finance versus receiver: debt visibility, other customer's order/file denied, quote revision and payment notice flow | NOT_RUN |
| A/B/C | ACC-CASE-03 | Invalid login, recovery request, actual test-mail delivery and password recovery using controlled inboxes | NOT_RUN |

Synthetic `example.test` accounts intentionally send no mail. Real recovery delivery requires controlled tester inboxes; never mark that case PASS based on a generic UI success message. Quote acceptance and payment notices can use the sent quotes and opening debts. Delivery verification requires complete supply-line fixtures before observation.

## Release verdict

ACC-CASE-26/27: BLOCKED/NOT_RUN; invoice provider remains excluded. No mock issue, legal number or provider success is acceptable.

ACC-CASE-28: PARTIAL at best after measured QA results; expanded scale and uncovered paths/domains remain blocked.

ACC-CASE-29: BLOCKED_BY_OWNER_DECISION; no backup/reset/restore command is included.

ACC-CASE-30: full release readiness is NOT_ESTABLISHED. QA evidence applies only to the exact candidate/config/dataset. L1 targeted, L2 affected regression, L3 phase gate, L4 release verification; no separate smoke layer.
