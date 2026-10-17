import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/access" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b1", branchName: "Chi nhánh A", employeeId: "me", permissions: new Set(["roles.manage", "inventory.read", "inventory.count", "orders.read"]) }) }));
vi.mock("@/components/access/invite-employee-form", () => ({ InviteEmployeeForm: () => <form>Biểu mẫu mời</form> }));
vi.mock("@/components/access/activation-link", () => ({ ActivationLinkForm: () => <form>Link kích hoạt</form> }));
vi.mock("@/components/access/manage-access-form", () => ({
  ManageAccessForm: () => <form>Đổi vai trò</form>, ExplicitPermissionForm: () => <form>Quyền riêng</form>,
  RevokeAccessForm: () => <form>Thu hồi</form>, ReactivateAccessForm: () => <form>Kích hoạt</form>,
}));
vi.mock("@/lib/access/role-actions", () => ({ saveCustomRoleAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "order", "range", "limit"]) query[method] = () => query;
    const rows = m.tables[table] ?? [];
    const result = Promise.resolve({ data: rows, error: null, count: rows.length });
    query.then = result.then.bind(result);
    return query;
  },
}) }));

import Page from "./page";

const role = (id: string, name: string, codes: string[], system_role = false) => ({ id, code: id, name, system_role, role_permissions: codes.map((permission_code) => ({ permission_code })) });
beforeEach(() => {
  m.tables = {
    employees: [
      { id: "e1", code: "NV01", display_name: "Anh Nam", active: true, employee_branch_access: [{ id: "a1", active: true, branch_id: "b1", branches: { id: "b1", name: "Chi nhánh A" }, roles: role("r1", "Thủ kho", ["inventory.read"]) }] },
      { id: "e2", code: "NV02", display_name: "Chị Lan", active: true, employee_branch_access: [{ id: "a2", active: false, branch_id: "b1", branches: { id: "b1", name: "Chi nhánh A" }, roles: role("r1", "Thủ kho", ["inventory.read"]) }] },
      { id: "me", code: "NV00", display_name: "Chủ", active: true, employee_branch_access: [] },
    ],
    branches: [{ id: "b1", name: "Chi nhánh A" }],
    roles: [role("r1", "Thủ kho", ["inventory.read"], true), role("r2", "Kho đêm", ["inventory.read", "inventory.count"]), role("r3", "Thu kho ca toi", ["inventory.read"]), role("owner", "Owner", ["roles.manage", "orders.read"])],
    permissions: [{ code: "inventory.read", name: "Xem tồn kho" }, { code: "inventory.count", name: "Kiểm kho" }, { code: "orders.read", name: "Xem đơn" }, { code: "roles.manage", name: "Quản lý quyền" }],
    employee_permission_grants: [],
    employee_branch_access: [{ role_id: "r2" }, { role_id: "r2" }],
  };
});
afterEach(cleanup);

it("lists employees with their actions in popups, tagged for scripted checks", async () => {
  render(await Page({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("link", { name: /Nhân viên/ })).toHaveAttribute("aria-current", "page");
  const nam = screen.getByText("Anh Nam").closest("tr")!;
  expect(within(nam).getByRole("button", { name: "Thu hồi" })).toHaveAttribute("data-access-id", "a1");
  expect(within(nam).getByRole("button", { name: "Quyền riêng" })).toHaveAttribute("data-action", "explicit");
  const lan = screen.getByText("Chị Lan").closest("tr")!;
  expect(within(lan).getByRole("button", { name: "Kích hoạt lại" })).toHaveAttribute("data-access-id", "a2");
  expect(within(lan).getByRole("button", { name: "Cấp vai trò" })).toBeInTheDocument();
  expect(within(screen.getByText("Chủ").closest("tr")!).queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mời nhân viên" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tạo vai trò" })).toBeInTheDocument();
});

it("shows preset and administrator roles read-only and custom roles editable", async () => {
  render(await Page({ searchParams: Promise.resolve({ tab: "roles" }) }));
  const rows = screen.getAllByRole("row").slice(1);
  const byName = (name: string) => rows.find((row) => row.textContent?.includes(name))!;
  expect(byName("Kho đêm")).toHaveTextContent("Tùy biến");
  expect(within(byName("Kho đêm")).getByRole("button", { name: "Sửa" })).toBeInTheDocument();
  expect(byName("Kho đêm")).toHaveTextContent("2");
  expect(byName("Thủ kho")).toHaveTextContent("Vai trò mẫu");
  expect(within(byName("Thủ kho")).getByRole("button", { name: "Xem" })).toBeInTheDocument();
  // A custom name without diacritics is shown as written, not as a generic label.
  expect(byName("Thu kho ca toi")).toHaveTextContent("Tùy biến");
  expect(byName("Chủ doanh nghiệp")).toHaveTextContent("Quản trị");
  expect(within(byName("Chủ doanh nghiệp")).getByRole("button", { name: "Xem" })).toBeInTheDocument();
});
