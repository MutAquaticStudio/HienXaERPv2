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

- GitHub runs lint, type checking and tests for each checkpoint.
- A push to the connected GitHub repository triggers the Vercel build; pushes to the Production branch deploy the Next.js Production application.
- Exactly one Supabase Cloud Production project provides PostgreSQL, Auth and private Storage.

Do not link the local CLI to the hosted project during routine phase work. Hosted Supabase migrations remain a separate, explicit deployment action.

## Verification

```bash
pnpm verify
```

Automatic Vercel Git deployments are enabled in `vercel.json`. Once the GitHub repository is connected to the Vercel project, every push triggers a Vercel build and the configured Production branch deploys Production. Applying hosted Supabase migrations always requires a separate explicit instruction.
