# P3 — Customer 360 and commercial pricing

P3 opens `/app/sales` as a Customer 360 workspace. It combines customer identity, contacts, delivery sites, timeline, a finance read model, commercial price resolution and credit control without starting quotations or sales orders from P4.

## Price resolution and history

The only supported precedence is:

1. customer + material;
2. customer + material group;
3. customer tier + material;
4. default material price.

`customer_price_rules` stores effective-dated immutable versions. Creating a new version closes the preceding interval; overlapping intervals at one resolution key are rejected. `app_private.resolve_customer_price` implements the precedence in PostgreSQL. `app_private.capture_selling_price_snapshot` copies the rule, customer, material, price, UOM and version into `selling_price_snapshots`, whose rows cannot be updated or deleted. A later master change therefore affects only future resolution.

## Credit boundary

`customer_credit_policies` is also effective-dated and versioned. `customer_credit_exposures` and `customer_finance_summaries` are read models, not editable balances. Receivables, unbilled orders, overdue amounts and customer advances remain separate fields; customer advances never become negative accounts receivable.

Sales users can read credit status but do not receive `customer_credit.override`. An override requires that explicit permission, a reason of at least ten characters, a dedicated immutable `customer_credit_override_events` row and the normal command audit event. Browser roles have SELECT only; trusted Production server commands own every mutation.

## Security and verification

All ten P3 public tables have RLS, explicit grants and permission-specific SELECT policies. Sensitive finance and exposure read models require `customer_credit.read`, manage or override permission. Functions in `app_private` have no execution grant for `anon` or `authenticated`.

Verification includes:

- unit tests for all four price levels, future version selection and frozen snapshots;
- unit tests for limit/overdue credit blocks, separate advances and override authorization;
- repository contract tests for RLS, read-only browser grants and immutable history;
- `supabase/tests/p3_customer_360_pricing.sql` for hosted PostgreSQL acceptance;
- Playwright desktop/mobile coverage, serious accessibility checks and overflow checks.
