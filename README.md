# HIỀN XA ERP

P1 builds the platform and security foundation for a modular-monolith ERP using Next.js, TypeScript, Vercel and exactly one hosted Supabase project in the Production role.

## Local development

Requirements: Node.js 22+ and pnpm 11. Local work must never use the hosted Production database.

```bash
cp .env.example .env.local
pnpm install
ALLOW_LOCAL_SYNTHETIC_AUTH=true pnpm dev
```

Synthetic authentication renders the protected shells with fake local identities and is rejected in Production. For local Supabase integration tests, use the disposable CLI runtime with synthetic records only:

```bash
pnpm exec supabase start
pnpm exec supabase db reset
pnpm test:db
```

Do not link the local CLI to the hosted project during routine phase work.

## Verification

```bash
pnpm verify
```

Automatic Vercel Git deployments are disabled in `vercel.json`. Applying migrations or deploying the approved checkpoint SHA to Production always requires a separate explicit instruction.
