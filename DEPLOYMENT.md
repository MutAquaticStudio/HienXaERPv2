# Cloud deployment checkpoint

Repository: MutAquaticStudio/HienXaERPv2

Supabase project: HienXaERPv2 (nbwynrwkdbtfsitafsxa), NOX-OS organization, Seoul.
Project creation and all nine cloud migrations are confirmed. The authorized Owner bootstrap and
the authenticated Purchase Order read path are verified; broader role and provider workflows remain pending.

## Configuration

Use the variable names in .env.cloud.example in the hosting environment.
Set the project's publishable key through the hosting environment settings.
Do not put a secret or service-role key in NEXT_PUBLIC variables.
Do not commit actual environment files or database credentials.

Apply the repository's ordered Supabase migrations to this project with migration history tracking
before releasing the application. Do not load local test fixtures into the cloud database.
Configure Auth Site URL and redirect allowlist for the final deployment URL.
Provision the initial authorized administrator separately.

## Post-deployment targeted checks

Run `node scripts/check-deployment.mjs https://deployment-url`.
The check covers public pages, unauthenticated portal redirects and private evidence denial.
This is a targeted release check, not a new test layer or an acceptance sign-off.

Authenticated worker/customer flows, Storage upload and signing, and migration verification
must also be exercised before declaring the deployment ready.

## Current status

- Local build and unit checks passed in R9.
- Local HTTP checks found missing Supabase runtime configuration.
- Vercel deployment: succeeded; https://hienxa-erp-v2.vercel.app.
- Hosted database migrations: 9/9 applied with migration history.
- Hosted HTTP checks: 8/8 passed, exit code 0.
- Authorized Owner bootstrap: configured for branch HX with the owner role and permission set.
- Acceptance: PARTIAL; technical release checks passed, while broader UAT/provider/recovery checks remain open.

## Deployment evidence: 2026-09-14

- Hosting project: hienxa-erp-v2, Vercel team slug noxelis, created through the signed-in browser.
- Deployment: dpl_9dicxMF8ZwNxYgsUc3hmxCrXxJrZ.
- Immutable hostname: hienxa-erp-v2-ukvscdwbw-noxelis.vercel.app.
- Deployed application commit: 26c0643327a136818b43b8dc02e1b0e705ded809 (main).
- PR #4 contains deployment documentation and checks; its branch is not the deployed application commit.
- Runtime configured with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  and HX_CLOUD_RUNTIME_APPROVED=true. No secret key or database password was supplied to hosting.
- Vercel browser reported successful deployment. The Vercel connector returned 404 for the same
  deployment ID; browser evidence and direct HTTP checks are the basis of the deployment result.

Supabase SQL Editor displayed the original eight migration versions, from 20260912101030 through
20260913100000. The Purchase Order grant fix, version 20260914060713, was subsequently applied and
recorded in supabase_migrations.schema_migrations. No test fixtures were loaded.

Post-migration SQL results:

| Check | Observed result |
| --- | --- |
| Public tables | 82 |
| Public tables without RLS | 0 |
| Public tables granting SELECT to anon | 0 |
| delivery-proofs bucket public | false |
| inventory-evidence bucket public | false |
| portal-evidence bucket public | false |
| Authorized application bootstrap | Owner account, branch HX, owner role and 62 permissions |

Command: `node scripts/check-deployment.mjs https://hienxa-erp-v2.vercel.app`

| Path | HTTP status | Check |
| --- | --- | --- |
| / | 200 | PASS |
| /login | 200 | PASS |
| /work/login | 200 | PASS |
| /customer/login | 200 | PASS |
| /api/health | 200 | PASS |
| /work | 200 with streamed login redirect | PASS |
| /customer | 200 with streamed login redirect | PASS |
| /api/evidence/00000000-0000-4000-8000-000000000000/signed | 401 | PASS |

These results establish only the listed checks, not full RLS correctness, authenticated access,
transactional business correctness, performance, or acceptance.

## Acceptance evidence: 2026-09-14

Candidate: `d9db020982b8f348752cfc0bca7b3acdc8a797a3`.

- `CI=true pnpm check`: PASS. ESLint, route type generation, TypeScript, 8 test files / 18 tests,
  and the optimized Next.js build with 51 generated pages completed successfully.
- `CI=true pnpm db:test:isolated`: PASS. Isolated PostgreSQL checks covered access through the
  worker/customer portal and payment-notice invariants; the R7 dashboard local sample was 5.39 ms
  and 715 bytes.
- `node scripts/check-deployment.mjs https://hienxa-erp-v2.vercel.app`: 8/8 PASS.
- GitHub status checks for the candidate: both Vercel projects reported success.
- Authenticated Owner browser check: `/admin/purchase-orders` rendered `0 đơn mua` and the empty
  state without the previous PostgreSQL 42501 error.
- Purchase Order regression: authenticated has `SELECT`, anon does not, RLS remains enabled, and
  `purchase_order_read` is queryable under the authenticated role.

Overall acceptance is `PARTIAL`, not `ACCEPTED`: the evidence above does not cover every case in
acceptance.md and does not authorize rewriting missing evidence as PASS.

## Outstanding release conditions

- Auth Site URL and redirect allowlist: configured for the deployed application URL.
- Authenticated worker/customer role journeys and Storage upload/signing: NOT_RUN.
- Provider sandbox behavior, recovery, concurrency at external boundaries, representative p95/p99
  performance, backup/restore rehearsal, and multi-role Owner UAT: NOT_RUN or BLOCKED by missing harness/data.
- Full release acceptance remains PARTIAL. Merging this scoped PR does not by itself establish
  `ACCEPTED` or `READY_FOR_RELEASE` for the whole product.
