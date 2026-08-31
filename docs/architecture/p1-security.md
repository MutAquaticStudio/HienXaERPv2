# P1 security architecture

## Trust boundaries

The browser receives only the Supabase URL and publishable key. Authorization is decided twice: server commands check the current principal and PostgreSQL RLS checks the authenticated database request. User-editable metadata is never used for roles or permissions.

Critical writes follow this boundary:

```text
authenticated request
→ live-runtime guard
→ active employee check
→ permission and data-scope check
→ idempotency reservation
→ transaction
→ immutable audit event
→ commit
```

`runServerCommand` is the application seam. `app_private.idempotency_keys` and `audit_events` are the persistence seams. Later phases must use these rather than issuing privileged mutations from Client Components.

## One hosted project

The code recognizes `*.supabase.co` as hosted. A hosted endpoint is rejected unless both `APP_ENV=production` and `VERCEL_ENV=production`. Hosted writes additionally require the server-only switch `ALLOW_LIVE_DB_WRITES=true`. Privileged Supabase keys and database URLs are rejected outside Production.

Local development uses either the disposable Supabase CLI stack or explicit synthetic authentication. Synthetic authentication cannot run in Production. No cloud Development, Preview, Staging or Branch project is referenced by this repository.

## Employee lifecycle and session safety

New Auth users become `INVITED`. Protected access requires the database profile to be `ACTIVE`; `SUSPENDED` and `DISABLED` therefore fail immediately even while an old access JWT has not expired. Logout uses global scope to revoke refresh sessions. Production Auth should retain the 15-minute JWT expiry represented by the local config.

Administrative lifecycle changes belong in authenticated server commands with `user.manage`, an audit event and global session revocation. No browser-visible privileged key is permitted.

## Evidence

The `evidence` Storage bucket is private. RLS limits object paths to the uploader's user-id folder and reads to the owning authorized user or an auditor. Metadata rows repeat the same ownership boundary. Evidence objects must be changed through the Storage API, never by mutating the Storage schema directly.

## P1 phase boundary

`work_items` contains only the minimal assignment seam needed to prove `ASSIGNED_ONLY`. P10 owns the real work lifecycle. Navigation placeholders explicitly remain phase-locked and do not implement P2–P12 behavior.
