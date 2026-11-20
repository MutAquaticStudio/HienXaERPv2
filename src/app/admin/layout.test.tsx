import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), state: vi.fn() }));
vi.mock("@/components/announcements/pending-updates", () => ({
  PendingUpdates: ({ surface, home }: { surface: string; home: string }) => <p data-testid="updates">{surface} {home}</p>,
}));
vi.mock("@/components/notifications/live-refresh", () => ({ LiveRefresh: () => null }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: mocks.access }));
vi.mock("@/modules/operations/server", () => ({ readOperationalState: mocks.state }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/astryx/astryx-app-shell", () => ({ AstryxAppShell: ({ children }: { children: React.ReactNode }) => <main data-skin="astryx">{children}</main> }));
vi.mock("@/lib/skin", () => ({ currentSkin: vi.fn(async () => "classic") }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/company/profile", () => ({ loadCompanyLogoUrl: vi.fn(async () => null) }));
import AdminLayout from "./layout";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ branchId: "branch", branchName: "Hiền Xa", employeeName: "Nhân viên", permissions: new Set(["orders.read"]) });
  mocks.state.mockResolvedValue({ state: "PENDING_OPENING", canActivate: false });
});
afterEach(cleanup);

it("opens routine modules without reading or displaying setup reminders", async () => {
  for (const title of ["Tổng quan", "Bán hàng", "Kho hàng", "Công nợ phải thu"]) {
    const view = render(await AdminLayout({ children: <h1>{title}</h1> }));
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByLabelText("Trạng thái vận hành")).not.toBeInTheDocument();
    expect(screen.queryByText(/chuẩn bị số dư đầu kỳ/i)).not.toBeInTheDocument();
    view.unmount();
  }
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.access).toHaveBeenCalledTimes(4);
});

it("D83: the office popup waits for this person's own home page", async () => {
  render(await AdminLayout({ children: <h1>Đơn bán</h1> }));
  expect(screen.getByTestId("updates")).toHaveTextContent("OFFICE /admin/orders");
  cleanup();
  mocks.access.mockResolvedValue({ branchId: "branch", branchName: "Hiền Xa", employeeName: "Chủ", permissions: new Set(["dashboard.read", "roles.manage"]) });
  render(await AdminLayout({ children: <h1>Tổng quan</h1> }));
  expect(screen.getByTestId("updates")).toHaveTextContent("OFFICE /admin");
});

it("keeps authentication and branch access required", async () => {
  mocks.access.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(AdminLayout({ children: <h1>Tổng quan</h1> })).rejects.toThrow("FORBIDDEN");
  expect(mocks.state).not.toHaveBeenCalled();
});
