import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), state: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: mocks.access }));
vi.mock("@/modules/operations/server", () => ({ readOperationalState: mocks.state }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
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

it("keeps authentication and branch access required", async () => {
  mocks.access.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(AdminLayout({ children: <h1>Tổng quan</h1> })).rejects.toThrow("FORBIDDEN");
  expect(mocks.state).not.toHaveBeenCalled();
});
