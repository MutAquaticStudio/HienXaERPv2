import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("P1 repository safety contract", () => {
  it("keeps automatic Vercel Git deployment disabled", () => {
    const config = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    expect(config.git.deploymentEnabled).toBe(false);
  });

  it("CI verifies code without a deploy or hosted migration command", () => {
    const workflow = readFileSync(
      join(root, ".github/workflows/ci.yml"),
      "utf8",
    );
    const packageJson = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(workflow).toContain("pnpm verify");
    expect(packageJson.scripts.verify).toContain("pnpm test:e2e");
    expect(packageJson.scripts["test:e2e"]).toContain("pnpm build");
    const playwrightConfig = readFileSync(
      join(root, "playwright.config.ts"),
      "utf8",
    );
    expect(playwrightConfig).toContain("next start");
    expect(playwrightConfig).not.toContain("next dev --hostname");
    expect(workflow).not.toMatch(/vercel\s+(deploy|--prod)/i);
    expect(workflow).not.toMatch(/supabase\s+(link|db push)/i);
    expect(workflow).not.toMatch(/supabase\s+(start|stop|db reset|test db)/i);
    expect(workflow).not.toMatch(/\bdocker\b/i);
  });

  it("keeps E2E evidence out of tracked documentation and releases preflighted", () => {
    const e2eDirectory = join(root, "tests/e2e");
    for (const filename of readdirSync(e2eDirectory)) {
      if (!filename.endsWith(".ts")) continue;
      const source = readFileSync(join(e2eDirectory, filename), "utf8");
      expect(source).not.toContain("docs/evidence/");
    }
    const evidence = readFileSync(join(e2eDirectory, "evidence.ts"), "utf8");
    const preflight = readFileSync(
      join(root, "scripts/release-preflight.mjs"),
      "utf8",
    );
    expect(evidence).toContain("testInfo.outputPath");
    expect(preflight).toContain('["status", "--porcelain"]');
    expect(preflight).toContain('["ls-remote", "--exit-code", "origin", "refs/heads/main"]');
    expect(preflight).toContain('pnpm, ["verify"]');
  });

  it("does not prefetch every authenticated workspace from persistent navigation", () => {
    const officeNavigation = readFileSync(
      join(root, "src/components/office-nav.tsx"),
      "utf8",
    );
    const workerNavigation = readFileSync(
      join(root, "src/components/worker-shell.tsx"),
      "utf8",
    );
    expect(officeNavigation).toContain("prefetch={false}");
    expect(workerNavigation).toContain("prefetch={false}");
  });

  it("opens worker earnings through the self-scoped P12 route", () => {
    const earningsPage = readFileSync(
      join(root, "src/app/work/earnings/page.tsx"),
      "utf8",
    );
    const repository = readFileSync(
      join(root, "src/modules/compensation/postgres-repository.ts"),
      "utf8",
    );
    expect(earningsPage).toContain(
      'hasPermission(principal, "earning.read_self")',
    );
    expect(repository).toContain('.eq("worker_user_id", principal.userId)');
    expect(earningsPage).not.toContain("Dự kiến mở");
  });

  it("migration enables RLS, private evidence and assigned-only access", () => {
    const migrationName = readdirSync(join(root, "supabase/migrations")).find(
      (name) => name.endsWith("_platform_core_security.sql"),
    );
    expect(migrationName).toBeTruthy();
    const sql = readFileSync(
      join(root, "supabase/migrations", migrationName as string),
      "utf8",
    );
    expect(sql).toContain(
      "alter table public.work_items enable row level security",
    );
    expect(sql).toContain(
      "alter table app_private.idempotency_keys enable row level security",
    );
    expect(sql).toContain("assigned_user_id = auth.uid()");
    expect(sql).toContain("public = false");
    expect(sql).toContain("app_private.is_active_user(auth.uid())");
    expect(sql).not.toContain("raw_user_meta_data ->> 'role'");
  });

  it("hardens the Supabase Automatic RLS event-trigger function", () => {
    const sql = readFileSync(
      join(
        root,
        "supabase/migrations/20260831150000_harden_supabase_auto_rls_function.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("to_regprocedure('public.rls_auto_enable()')");
    expect(sql).toContain(
      "revoke execute on function public.rls_auto_enable() from public, anon, authenticated",
    );
  });
});
