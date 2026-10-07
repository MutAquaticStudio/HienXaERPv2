import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listAssignmentEmployees } from "./assignment-options";

function fixture(data: unknown[], error: unknown = null) {
  const builder = { select: vi.fn(), eq: vi.fn(), then: (resolve: (value: unknown) => unknown) => resolve({ data, error }) };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  const from = vi.fn().mockReturnValue(builder);
  return { client: { from } as unknown as Pick<SupabaseClient, "from">, from, builder };
}

describe("delivery assignment employee options", () => {
  it("uses employee membership FKs and explicit trusted branch/active filters", async () => {
    const f = fixture([{ employees: { id: "worker-id", display_name: "Worker" } }]);
    expect((await listAssignmentEmployees(f.client, "trusted-branch")).data).toEqual([{ id: "worker-id", display_name: "Worker" }]);
    expect(f.from).toHaveBeenCalledWith("employee_branch_access");
    expect(f.builder.select).toHaveBeenCalledWith("employees!inner(id, display_name), roles!inner(active)");
    expect(f.builder.eq.mock.calls).toEqual([["branch_id", "trusted-branch"], ["active", true], ["employees.active", true], ["roles.active", true]]);
  });
  it("deduplicates active role memberships by actual employee identity", async () => {
    const f = fixture([{ employees: { id: "worker-id", display_name: "Worker" } }, { employees: [{ id: "worker-id", display_name: "Worker" }] }]);
    expect((await listAssignmentEmployees(f.client, "branch")).data).toHaveLength(1);
  });
  it("does not hide a reader error behind an empty roster", async () => {
    await expect(listAssignmentEmployees(fixture([], { code: "42501" }).client, "branch")).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE", status: 503 });
  });
  it("fails closed for an unexpected relation payload", async () => {
    await expect(listAssignmentEmployees(fixture([{ employees: null }]).client, "branch")).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE", status: 503 });
  });
});
