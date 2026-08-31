import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("P1 repository safety contract", () => {
  it("disables automatic Vercel Git deployment", () => {
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
    expect(sql).toContain("assigned_user_id = auth.uid()");
    expect(sql).toContain("public = false");
    expect(sql).toContain("app_private.is_active_user(auth.uid())");
    expect(sql).not.toContain("raw_user_meta_data ->> 'role'");
  });
});
