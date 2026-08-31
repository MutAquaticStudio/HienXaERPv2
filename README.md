# HIỀN XA ERP

P1 builds the platform and security foundation for a modular-monolith ERP using Next.js, TypeScript, Vercel and exactly one hosted Supabase project in the Production role.

## Local development

Requirements: Node.js 22+ and pnpm 11. Local work must never use the hosted Production database.

```bash
cp .env.example .env.local
pnpm install
ALLOW_LOCAL_SYNTHETIC_AUTH=true pnpm dev
```

Synthetic authentication renders the protected shells with fake local identities and is rejected in Production. Local development and CI do not require Docker or a local Supabase runtime.

The hosted architecture is:

- GitHub runs lint, type checking, tests and the production build for each checkpoint.
- Vercel runs the Next.js Production application.
- Exactly one Supabase Cloud Production project provides PostgreSQL, Auth and private Storage.

Do not link the local CLI to the hosted project during routine phase work. Hosted migrations and the Vercel Production release remain explicit deployment actions.

## Verification

```bash
pnpm verify
```

Automatic Vercel Git deployments are disabled in `vercel.json`. Pushing a checkpoint to GitHub runs verification but does not deploy Production. Applying migrations or deploying the approved checkpoint SHA to Production always requires a separate explicit instruction.
