# PostgreSQL optimization, 2026-10-02

## State and scope

- State: ISOLATED_INDEX_VALIDATED; authorized real-database metadata inventory COMPLETE. Production migration and native/cloud performance validation remain NOT_RUN.
- Production: read-only metadata inspection through the existing authenticated Supabase dashboard; no data, schema, grants or configuration changed. Cloud QA was not accessed.
- No commit, push, deployment, dependency installation or business-contract change.
- Owner authorized synthetic isolated EXPLAIN/ANALYZE and related DB checks. Real-data deletion was not authorized.
- Candidate: `supabase/migrations/20261002071813_index_quotation_and_customer_credit_lookups.sql`.
- Storage inventory: `scripts/sql/postgres-storage-audit.sql`; metadata-only read transaction, no cleanup.

## Evidence and runtime

- Baseline: all 68 existing migrations through `20261001182059_sales_order_confirmation_credit_override.sql` replayed into an isolated PGlite database.
- Runtime: PostgreSQL 18.3 / PGlite 0.5.8 / Node.js 24.18.0. Project configuration targets PostgreSQL 17; native PostgreSQL 17 and cloud measurements remain NOT_RUN.
- Dataset: 10 branches, 1,000 customers, 1,000 sites, 20,000 quotations with revisions, 20,000 opening-balance receivables, 6,666 adjustments and 20,000 credit commitments. No payment allocations in this performance fixture.
- Seven EXPLAIN samples per query, one result-query warm-up, warm shared buffers, concurrency 1. These are local PostgreSQL execution times, not network/UI latency or representative cloud p95/p99.
- Catalogue confirmed no equivalent indexes on the three chosen keys. Existing unique and branch-leading indexes were preserved.
- Quotation, AR lookup and commitment aggregate were measured as an authenticated synthetic Owner with RLS enabled. The credit exposure view was measured as postgres, matching its internal use by postgres-owned commands; direct application access was not granted.
- Durable evidence directory: `reports/postgres-20261002/` (before/after plans, real storage metadata, executed inventory SQL, DB regression log and input hashes). Temporary profiling runtime: `/private/tmp/hx-postgres-profile-20261002/`.

## Baseline and candidate

| Query | Baseline median ms | After median ms | Baseline plan | Candidate index |
| --- | ---: | ---: | --- | --- |
| quotation list, newest-first bounded page | 140.741 | 3.998 | sequential quotation scan, 18,000 rows filtered, 2,000 revision lookups and sort for 26 results | `(branch_id, created_at DESC, id DESC)` |
| receivable lookup by customer | 3.666 | 0.904 | sequential scan, 19,980 rows filtered | `(customer_id)` |
| commitment aggregate by customer | 2.589 | 0.897 | sequential scan, 19,980 rows filtered | `(customer_id)` |
| internal customer credit exposure | 3.448 | 0.302 | sequential scans of receivables and commitments | reuses both customer indexes |

The final quotation plan uses the new ordered index, touches 26 quotation/revision rows instead of 2,000, and avoids the page sort. Root shared-buffer hits reduced from 46,409 to 583. Customer lookups use the new bitmap indexes; the credit view uses both. Every result row/value, including timestamps and financial totals, matches the persisted baseline and its SHA-256 result hash.

The candidate indexes occupy 1,187,840 + 180,224 + 180,224 bytes in the synthetic database (1,548,288 bytes total). Indexes trade extra storage/write work for faster lookup; they do not reduce stored business data.

## Checks and limitations

- `node scripts/test-r2-database.mjs`: NEW PASS, exit 0. Existing isolated access-through-R9 worker/customer portal and payment-notice assertions passed with the candidate migration.
- View, policy and table-grant equivalence for the affected relations: NEW PASS. Before/after SHA-256: `aa73a092fab2e9fa966b1527b9d2196dc32b198b583066d064c6af1dc206626e`.
- Storage inventory SQL: PASS in isolation; real metadata inventory NEW PASS through the authenticated dashboard on project `nbwynrwkdbtfsitafsxa`, HienXaERPv2 / main. The executed bounded SELECT used a READ ONLY transaction and a local statement timeout. No connector, business rows, DDL or DML were used for this inventory.
- Manual expected credit arithmetic was checked against the synthetic dataset during baseline profiling.
- Historical post-index run: exited 1 at comparison of JavaScript Date objects against timestamp strings loaded from baseline JSON. Its failure log was preserved; it is a harness representation error, not evidence of an application defect.
- Owner subsequently authorized temporary comparator normalization and the affected after-stage rerun. The comparator now checks exact result hashes and compares all rows in the same persisted JSON representation; expected business amounts were not changed.
- Final after-stage rerun: NEW PASS, exit 0. Result equivalence, manual expected credit arithmetic, ungranted-actor row isolation, forbidden direct internal credit-view access (42501), and index-DDL replay all passed. It reused the unchanged synthetic dataset and did not reseed or change the business fixture.
- Existing DB regression and affected-boundary evidence were REUSED from the immediately preceding index candidate: comparator-only changes do not invalidate the unchanged migration, views, RLS or grants. They were not unnecessarily rerun.
- Earlier fixture runs exited 1 because of incorrect fixture column names; fixture transactions rolled back. The temporary names were corrected after Owner authorization. A subsequent direct credit-view query returned SQLSTATE 42501; profiling then used the actual internal command context without changing grants. Failure details remain part of this evidence record.
- No frontend build, UI UAT, cloud latency, native PostgreSQL 17, real multi-session race or production migration check was run in this index-only task.
- Ordinary CREATE INDEX may block writes during deployment. Production deployment requires separate authorization, target catalogue review and an appropriate operational window; no online deployment claim is made.

## Real storage inventory and cleanup decision

Captured at `2026-10-02T07:52:58.808482Z` on Supabase project `nbwynrwkdbtfsitafsxa`. The server reported PostgreSQL 17.6; no native query-performance test was run there.

| Scope | Tables | Relation bytes (tables/TOAST plus indexes) | Approx. MiB |
| --- | ---: | ---: | ---: |
| public | 99 | 4,079,616 | 3.89 |
| auth | 27 | 1,572,864 | 1.50 |
| storage | 8 | 303,104 | 0.29 |
| Entire database | not a table count | 20,933,779 | 19.96 |

The dashboard query's database size is `20 MB`. The three schema totals do not account for every database relation/system catalogue or allocated volume; they are not filesystem or object-storage size measurements. Statistical row counts and dead-tuple counts are estimates, not exact business counts or proof of reclaimable disk space. The top-table/top-index listings are capped at 25 each.

The largest public relation in the returned listing is `sales_order_credit_overrides`, 114,688 bytes; the next two are `audit_events` and `pricing_rules`, 98,304 bytes each. These measurements do not substantiate the concern that the selected database is excessively large. Many table names do not imply a large dataset. No table or index was classified as safe to delete solely because it is small, empty-looking or has zero recorded scans.

Decision: NO_CLEANUP_NEEDED_ON_STORAGE_EVIDENCE. No rows, tables, indexes, authentication records or migration history were deleted or merged. The candidate lookup migration remains unapplied to Production; future growth is the reason to retain the measured lookup optimization, not a claim that real-data storage has shrunk. If the Owner wants to remove QA/UAT records for business cleanliness, that is a separate provenance/dependency/reconciliation scope, not required by the measured storage footprint.

## Safe boundaries for any later cleanup

- Synthetic QA/UAT records: identify exact fixture provenance and dependency graph before any targeted removal. Existing QA cleanup can revoke account access and is not a generic data purge.
- Supabase-managed auth/storage tables and migration history are not disposable application clutter. Do not manually purge them merely to reduce the table list.
- GPS history: preserve the existing operational retention contract and dispute holds; do not invent a new retention period.
- Orders, receipts, stock ledger, AR/AP, payments, adjustments, document snapshots and audit history: do not delete or merge merely to reduce table count. Retention/archive changes require a separately confirmed scope and recovery/reconciliation procedure.
- Do not drop indexes solely because usage counters are zero; counters reset and unique/primary-key indexes enforce constraints.
- Deletion does not normally shrink PostgreSQL files immediately. Ordinary vacuum supports space reuse; full vacuum rewrites and locks the relation and needs extra space. Neither was executed.

Primary references: [PostgreSQL 17 multicolumn indexes](https://www.postgresql.org/docs/17/indexes-multicolumn.html), [PostgreSQL 17 CREATE INDEX](https://www.postgresql.org/docs/17/sql-createindex.html), [PostgreSQL 17 routine vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html), [Supabase database/disk size](https://supabase.com/docs/guides/platform/database-size).
