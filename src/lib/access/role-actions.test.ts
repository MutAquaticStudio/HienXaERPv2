import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), access: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: m.access }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({ rpc: m.rpc })) }));

import { groupPermissions, OWNER_ONLY_PERMISSIONS } from "./permission-groups";
import { saveCustomRoleAction } from "./role-actions";

const op = "11111111-1111-4111-8111-111111111111", role = "22222222-2222-4222-8222-222222222222";
const base = { operationId: op, roleId: null, name: "Thủ kho ca tối", permissions: ["inventory.count", "inventory.read"], expected: null, active: true };
beforeEach(() => { vi.clearAllMocks(); m.access.mockResolvedValue({ branchId: "b" }); m.rpc.mockResolvedValue({ data: role, error: null }); });

it("saves a custom role through save_custom_role for the owner's branch", async () => {
  expect(await saveCustomRoleAction(base)).toMatchObject({ status: "SUCCESS", roleId: role });
  expect(m.access).toHaveBeenCalledWith("roles.manage");
  expect(m.rpc).toHaveBeenCalledWith("save_custom_role", { target_branch_id: "b", target_role_id: null, role_name: "Thủ kho ca tối",
    permission_codes: ["inventory.count", "inventory.read"], expected_permission_codes: null, role_active: true, operation_id: op });
});

it("explains refusals and keeps an unknown outcome retryable", async () => {
  expect((await saveCustomRoleAction({ ...base, name: "x" })).status).toBe("FAILED");
  expect(m.rpc).not.toHaveBeenCalled();
  for (const [code, text] of [["owner_only_permission", "chỉ dành cho chủ doanh nghiệp"], ["role_exceeds_actor_permissions", "chính bạn không có"], ["role_not_editable", "chỉ xem"], ["role_in_use", "đang được gán"]]) {
    m.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: code } });
    expect((await saveCustomRoleAction(base)).message).toContain(text);
  }
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Could not find the function public.save_custom_role" } });
  expect(await saveCustomRoleAction(base)).toMatchObject({ status: "FAILED", message: expect.stringContaining("chưa bật chức năng vai trò tùy biến") });
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
  expect((await saveCustomRoleAction(base)).status).toBe("UNKNOWN");
});

it("groups permissions like the menu and keeps roles.manage owner only", () => {
  const groups = groupPermissions([{ code: "orders.read" }, { code: "inventory.count" }, { code: "finance.ar.read" }, { code: "dashboard.read" }]);
  expect(groups.map((group) => group.label)).toEqual(["Bán hàng", "Kho hàng", "Tài chính", "Khác"]);
  expect(OWNER_ONLY_PERMISSIONS).toContain("roles.manage");
});
