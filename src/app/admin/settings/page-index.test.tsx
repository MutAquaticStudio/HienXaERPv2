import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const tables: Record<string, unknown> = {
  branch_operation_settings: { stop_minutes: 60, version: 2, default_warehouse_id: null, auto_source_enabled: true, trip_cost_vnd: null, dispatch_mode: "SUGGEST", work_day_start: "07:00:00", work_day_end: "18:00:00" },
  warehouses: [],
  company_profile: { portal_branch_id: null },
  branches: [{ id: "b1", name: "Hiền Xa" }, { id: "b2", name: "Hiền Xa 2" }],
  audit_events: null,
  employees: null,
};
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b1", branchName: "Hiền Xa", permissions: new Set(["roles.manage"]) }) }));
vi.mock("@/lib/company/profile", async (original) => ({ ...(await original<typeof import("@/lib/company/profile")>()), loadCompanyProfile: async () => null, loadCompanyLogo: async () => null }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({
  from: (table: string) => {
    const result = { data: tables[table] ?? null, error: null };
    const query: Record<string, unknown> = {};
    for (const key of ["select", "eq", "order", "limit"]) query[key] = () => query;
    query.maybeSingle = async () => result;
    query.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return query;
  },
  rpc: async (name: string) => ({ data: name === "zalo_status" ? { state: "DISCONNECTED" } : null, error: null }),
}) }));
vi.mock("@/modules/settings/company-actions", () => ({ saveCompanyProfileAction: vi.fn(), saveCompanyLogoAction: vi.fn() }));
vi.mock("@/modules/settings/operation-actions", () => ({ saveOperationSettingsAction: vi.fn() }));
vi.mock("@/modules/settings/portal-branch-actions", () => ({ setPortalBranchAction: vi.fn() }));
import SettingsPage from "./page";

afterEach(cleanup);

it("opens on a grouped index that says how each setting stands (D59)", async () => {
  render(await SettingsPage());
  const index = screen.getByRole("navigation", { name: "Mục cài đặt" });
  for (const group of ["Doanh nghiệp & in ấn", "Bán hàng & giá", "Giao hàng & kho", "Kết nối & tự động", "Nhân viên, quyền & dữ liệu", "Thiết bị này"])
    expect(within(index).getByRole("heading", { name: group })).toBeInTheDocument();
  // Pricing and the audit log are findable from Cài đặt now.
  expect(within(index).getByRole("link", { name: /Chính sách giá/ })).toHaveAttribute("href", "/admin/settings/pricing");
  expect(within(index).getByRole("link", { name: /Nhật ký hoạt động/ })).toHaveAttribute("href", "/admin/audit");
  expect(within(index).getByRole("link", { name: /Khách tự đăng ký/ })).toHaveTextContent("Chưa chọn — đang đóng");
  expect(within(index).getByRole("link", { name: /Zalo OA/ })).toHaveTextContent("Chưa kết nối");
  expect(within(index).getByRole("link", { name: /Vận hành giao hàng/ })).toHaveTextContent("Gợi ý điều phối");
  expect(within(index).getByRole("link", { name: /Thông tin doanh nghiệp/ })).toHaveTextContent("Chưa nhập");
  // The delivery form wakes its save button only on a change (version 2 is saved).
  expect(screen.getByRole("button", { name: "Lưu cài đặt giao hàng" })).toBeDisabled();
  expect(screen.getByLabelText("Giờ bắt đầu ngày làm")).toHaveValue("07:00");
});
