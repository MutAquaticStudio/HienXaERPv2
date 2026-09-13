# Cloud deployment checkpoint

Repository: MutAquaticStudio/HienXaERPv2

Supabase project: HienXaERPv2 (nbwynrwkdbtfsitafsxa), NOX-OS organization, Seoul.
Project creation is confirmed. Cloud migrations and authenticated workflows remain unverified.

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
- Vercel deployment: pending.
- Hosted database migrations: pending.
- Hosted checks: pending.
- Acceptance: not run.
