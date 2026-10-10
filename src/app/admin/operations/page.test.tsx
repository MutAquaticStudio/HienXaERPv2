import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppError } from "@/lib/core/errors";

const mocks = vi.hoisted(() => ({ access: vi.fn(), permission: vi.fn(), state: vi.fn(), activate: vi.fn() }));
vi.mock("@/lib/access/context", () => ({ requireInternalAccess: mocks.access, requireInternalPermission: mocks.permission }));
vi.mock("@/modules/operations/server", () => ({ readOperationalState: mocks.state }));
vi.mock("./actions", () => ({ activateOperations: mocks.activate }));
import OperationsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  const access = { branchId: "branch", branchName: "Hiền Xa", permissions: new Set(["roles.manage"]) };
  mocks.access.mockResolvedValue(access);
  mocks.permission.mockResolvedValue(access);
  mocks.state.mockResolvedValue({ state: "PENDING_OPENING", version: 0, canActivate: false, reconciliationId: null });
});
afterEach(cleanup);

it("shows setup status only to the authorized administrator who opens this page", async () => {
  render(await OperationsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.permission).toHaveBeenCalledWith("roles.manage");
  expect(mocks.state).toHaveBeenCalledWith("branch");
  expect(screen.getByRole("heading", { name: "Chuẩn bị vận hành" })).toBeInTheDocument();
  expect(screen.queryByText("PENDING_OPENING")).not.toBeInTheDocument();
  expect(screen.queryByText("NOT_VERIFIED")).not.toBeInTheDocument();
  expect(screen.getByText(/nhập và đối chiếu số dư đầu kỳ/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Kích hoạt vận hành" })).not.toBeInTheDocument();
  expect(mocks.activate).not.toHaveBeenCalled();
});

it("does not read setup status when the administrator permission is denied", async () => {
  mocks.permission.mockRejectedValue(new Error("FORBIDDEN"));
  await expect(OperationsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("FORBIDDEN");
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.activate).not.toHaveBeenCalled();
});

it("renders expected permission denial without exposing setup or throwing a runtime error", async () => {
  mocks.permission.mockRejectedValue(new AppError({ code: "FORBIDDEN", status: 403, message: "Bạn không có quyền thực hiện thao tác này." }));
  render(await OperationsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("heading", { name: "Không có quyền truy cập" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Về trang chính" })).toHaveAttribute("href", "/");
  expect(screen.queryByText(/số dư đầu kỳ/i)).not.toBeInTheDocument();
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.activate).not.toHaveBeenCalled();
});

it("keeps activation absent for unknown status and actors not authorized by the database", async () => {
  for (const state of [null, { state: "READY_FOR_ACTIVATION", version: 1, canActivate: false, reconciliationId: "readback" }]) {
    mocks.state.mockResolvedValue(state);
    const view = render(await OperationsPage({ searchParams: Promise.resolve({}) }));
    expect(screen.queryByRole("button", { name: "Kích hoạt vận hành" })).not.toBeInTheDocument();
    expect(screen.queryByText("READY_FOR_ACTIVATION")).not.toBeInTheDocument();
    expect(screen.queryByText("NOT_VERIFIED")).not.toBeInTheDocument();
    view.unmount();
  }
});

it("retains the exact version-bound confirmation only when the database authorizes activation", async () => {
  mocks.state.mockResolvedValue({ state: "READY_FOR_ACTIVATION", version: 2, canActivate: true, reconciliationId: "readback" });
  render(await OperationsPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("button", { name: "Kích hoạt vận hành" })).toBeInTheDocument();
  expect(screen.getByText("ACTIVATE:branch:2")).toBeInTheDocument();
  expect(screen.getByRole("checkbox")).toBeRequired();
  expect(screen.getByLabelText("Xác nhận kích hoạt")).toBeRequired();
  expect(mocks.activate).not.toHaveBeenCalled();
});
