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
    expect(workflow).toContain("pnpm build");
    expect(workflow).not.toMatch(/vercel\s+(deploy|--prod)/i);
    expect(workflow).not.toMatch(/supabase\s+(link|db push)/i);
    expect(workflow).not.toMatch(/supabase\s+(start|stop|db reset|test db)/i);
    expect(workflow).not.toMatch(/\bdocker\b/i);
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

  it("keeps worker earnings locked until its baseline phase", () => {
    const workerSection = readFileSync(
      join(root, "src/app/work/[section]/page.tsx"),
      "utf8",
    );
    expect(workerSection).toContain("Dự kiến mở tại P12");
    expect(workerSection).toContain("Lương thưởng &amp; Năng suất");
    expect(workerSection).not.toContain("Chưa mở trong P1");
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
    expect(sql).toContain("alter table public.work_items enable row level security");
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
