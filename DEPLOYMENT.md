# Cloud deployment checkpoint

Repository: MutAquaticStudio/HienXaERPv2

Supabase project: HienXaERPv2 (nbwynrwkdbtfsitafsxa), NOX-OS organization, Seoul.
Project creation and all eight cloud migrations are confirmed. Authenticated workflows remain unverified.

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
- Hosted database migrations: 8/8 applied with migration history.
- Hosted HTTP checks: 8/8 passed, exit code 0.
- Acceptance: not run; authenticated workflows are blocked by missing bootstrap accounts and data.

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

Supabase SQL Editor displayed all eight migration versions, from 20260912101030 through
20260913100000. The remaining seven migrations were applied together in one transaction,
with their original SQL stored in supabase_migrations.schema_migrations. No test fixtures were loaded.

Post-migration SQL results:

| Check | Observed result |
| --- | --- |
| Public tables | 82 |
| Public tables without RLS | 0 |
| Public tables granting SELECT to anon | 0 |
| delivery-proofs bucket public | false |
| inventory-evidence bucket public | false |
| portal-evidence bucket public | false |
| Auth users / employees / branches / customer memberships | 0 / 0 / 0 / 0 |

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

## Outstanding release conditions

- Auth Site URL and redirect allowlist: not updated. Browser automation became stuck on the
  Authentication sidebar; reload, a new-tab attempt, and session reset did not restore the form.
  The new-tab paste attempt timed out and screenshots were unavailable. No Auth URL save was confirmed.
- Bootstrap: no authorized application administrator, employee, branch, or customer membership exists.
  The actual owner identity and initial business scope must be supplied before assigning privileges.
- Authenticated login/recovery, worker/customer workflows, and Storage upload/signing: NOT_RUN.
- Acceptance: NOT_RUN; no acceptance case is marked PASS from HTTP or schema checks alone.
- Backup/restore and full release gate: NOT_RUN. This deployment is not a production-readiness sign-off.
