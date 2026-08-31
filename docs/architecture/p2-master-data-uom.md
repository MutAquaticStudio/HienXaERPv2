# P2 — Master data and construction UOM

## Outcome

P2 adds the operational master-data workspace at `/app/data` without weakening the P1 security boundary. Local development uses synthetic records; Production reads and writes the single hosted Supabase project through authenticated server commands.

## Data model

- `material_groups`, `materials` and `uom_catalog` define material identity and base, purchase and sales UOMs.
- `material_uom_conversions` stores immutable, versioned, material-specific conversion rules.
- `uom_conversion_snapshots` captures the exact conversion version and labels used by a downstream transaction.
- `warehouses`, `vehicles` and `vehicle_load_profiles` define operational planning capacity.
- `employee_operational_profiles`, `worker_skill_catalog` and `worker_skills` provide the worker-skill baseline.

All public P2 tables have RLS enabled. Authenticated browser clients receive authorized `SELECT` access only. Mutations run in a server-side transaction that checks the actor's database permission and records an idempotency key plus audit event.

## Conversion safety

Each alternate UOM converts directly to the material's base UOM. This star topology cannot form a conversion cycle. Decimal values are parsed as integer fractions and rounded once at the declared output scale, avoiding floating-point drift.

`EXACT` is allowed only within one physical dimension. Cross-dimension rules such as mass to volume must be `ESTIMATED`, `MEASURED` or a material packaging rule, and the workspace renders the method label and disclaimer with the result.

Closing a conversion version is the only allowed update; rule content and snapshots cannot be rewritten or deleted. A material base UOM becomes immutable once conversion history exists. Referenced UOMs remain readable after deactivation.

Vehicle load profiles are constrained to `PLANNING_CAPACITY`; they do not participate in the conversion graph.

## Verification

- Vitest covers conversion precision, command validation, lifecycle and migration contracts.
- Playwright covers desktop/mobile behavior, method disclosure, audited form feedback, overflow and serious accessibility violations.
- `supabase/tests/p2_master_data_uom.sql` proves the P2 acceptance rules in a transaction that always rolls back.
- `supabase/tests/p1_security.sql` is rerun after RLS initialization-plan hardening to prove P1 authorization remains intact.
- Supabase Security and Performance Advisors are rerun after Production schema changes.

Visual evidence:

- `docs/evidence/p2-master-data-implemented.png`
- `docs/evidence/p2-master-data-mobile-implemented.png`
