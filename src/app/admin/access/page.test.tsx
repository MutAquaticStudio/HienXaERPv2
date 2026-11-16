import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, forms: {} as Record<string, Record<string, unknown>> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin/access" }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b1", branchName: "Chi nhánh A", employeeId: "me", permissions: new Set(["roles.manage", "inventory.read", "inventory.count", "orders.read"]) }) }));
vi.mock("@/components/access/invite-employee-form", () => ({ InviteEmployeeForm: () => <form>Biểu mẫu mời</form> }));
vi.mock("@/components/access/activation-link", () => ({ ActivationLinkForm: () => <form>Link kích hoạt</form> }));
vi.mock("@/components/access/manage-access-form", () => ({
  ManageAccessForm: (props: Record<string, unknown>) => { m.forms.role = props; return <form>Đổi vai trò</form>; },
  ExplicitPermissionForm: (props: Record<string, unknown>) => { m.forms.explicit = props; return <form>Quyền riêng</form>; },
  RevokeAccessForm: () => <form>Thu hồi</form>, ReactivateAccessForm: () => <form>Kích hoạt</form>,
  RemoveEmployeeForm: () => <form>Xóa</form>, RestoreEmployeeForm: () => <form>Dùng lại</form>,
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
  // Owner 16/11/2026: two everyday actions in the row; the rest, destructive ones last, behind "Thêm".
  expect(within(nam).getAllByRole("button").map((button) => button.textContent)).toEqual(["Đổi vai trò", "Quyền riêng", "Thêm"]);
  expect(within(nam).getByRole("button", { name: "Quyền riêng" })).toHaveAttribute("data-action", "explicit");
  const more = within(nam).getByRole("button", { name: "Thêm thao tác · Anh Nam" });
  expect(more).toHaveAttribute("data-access-id", "a1");
  fireEvent.click(more);
  const menu = screen.getByRole("menu", { name: "Thêm thao tác · Anh Nam" });
  expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Link kích hoạt", "Thu hồi", "Xóa"]);
  expect(within(menu).getByRole("menuitem", { name: "Thu hồi" })).toHaveAttribute("data-access-id", "a1");
  expect(within(menu).getByRole("menuitem", { name: "Thu hồi" })).toHaveClass("more-actions-danger");
  expect(within(menu).getByRole("menuitem", { name: "Xóa" })).toHaveAttribute("data-action", "remove");
  // The item opens the same confirmation form as before.
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Thu hồi" }));
  expect(screen.getByRole("dialog", { name: "Thu hồi quyền · Anh Nam" })).toHaveTextContent("Thu hồi");
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  const lan = screen.getByText("Chị Lan").closest("tr")!;
  expect(within(lan).getByRole("button", { name: "Kích hoạt lại" })).toHaveAttribute("data-access-id", "a2");
  expect(within(lan).getByRole("button", { name: "Cấp vai trò" })).toBeInTheDocument();
  fireEvent.click(within(lan).getByRole("button", { name: "Thêm thao tác · Chị Lan" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Xóa"]);
  const me = screen.getByText("Chủ").closest("tr")!;
  expect(within(me).queryByRole("button")).not.toBeInTheDocument();
  expect(me).toHaveTextContent("Tài khoản của bạn");
  expect(screen.getByRole("button", { name: "Mời nhân viên" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Tạo vai trò" })).toBeInTheDocument();
});

it("shows two extra permissions and +N, and hands the popups the role the person holds", async () => {
  m.tables.employee_permission_grants = ["inventory.count", "orders.read", "roles.manage"].map((permission_code) => ({ employee_id: "e1", branch_id: "b1", permission_code }));
  render(await Page({ searchParams: Promise.resolve({}) }));
  const nam = screen.getByText("Anh Nam").closest("tr")!;
  const chips = within(nam).getByRole("list");
  expect(chips).toHaveAttribute("title", "Kiểm kho, Xem đơn, Quản lý quyền");
  expect(within(chips).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Kiểm kho", "Xem đơn", "+1và 1 quyền khác: Quản lý quyền"]);
  fireEvent.click(within(nam).getByRole("button", { name: "Đổi vai trò" }));
  expect(m.forms.role).toMatchObject({ employeeId: "e1", assignments: [{ branchId: "b1", branchName: "Chi nhánh A", roleId: "r1", roleLabel: "Thủ kho", active: true }] });
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  fireEvent.click(within(nam).getByRole("button", { name: "Quyền riêng" }));
  expect(m.forms.explicit).toMatchObject({ branchId: "b1", selected: ["inventory.count", "orders.read", "roles.manage"], roleName: "Thủ kho",
    inherited: [{ code: "inventory.read", name: "Xem tồn kho" }] });
  expect((m.forms.explicit.permissions as { code: string }[]).map((item) => item.code)).not.toContain("inventory.read");
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
