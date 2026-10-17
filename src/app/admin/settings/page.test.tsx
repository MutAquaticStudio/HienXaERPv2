import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ profile: null as unknown, cookie: undefined as string | undefined, save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => m.cookie === undefined ? undefined : { value: m.cookie } }) }));
vi.mock("@/lib/access/context", () => ({ requireInternalPermission: async () => ({ branchId: "b", branchName: "Chi nhánh Đông Anh", permissions: new Set(["roles.manage"]) }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({}) }));
vi.mock("@/lib/company/profile", async (original) => ({ ...(await original<typeof import("@/lib/company/profile")>()), loadCompanyProfile: async () => m.profile }));
vi.mock("@/modules/settings/company-actions", () => ({ saveCompanyProfileAction: m.save }));

import Page from "./page";

beforeEach(() => {
  m.profile = null; m.cookie = undefined; m.save.mockReset(); m.refresh.mockReset();
  document.documentElement.removeAttribute("data-color");
});
afterEach(() => { cleanup(); document.cookie = "hx-appearance=; path=/; max-age=0"; });

it("fills in the company profile with a live preview of the document heading", async () => {
  m.save.mockResolvedValue({ status: "SUCCESS", version: 1, message: "Đã lưu. Chứng từ in từ bây giờ dùng thông tin này." });
  render(await Page());
  const preview = screen.getByLabelText("Xem trước tiêu đề chứng từ");
  expect(within(preview).getByText("Hiền Xa ERP")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tên doanh nghiệp *"), { target: { value: "Công ty TNHH Hiền Xa" } });
  fireEvent.change(screen.getByLabelText("Mã số thuế"), { target: { value: "0101234567" } });
  expect(within(preview).getByText("Công ty TNHH Hiền Xa")).toBeInTheDocument();
  expect(within(preview).getByText("MST: 0101234567")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin doanh nghiệp" }));
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: null, profile: expect.objectContaining({ legal_name: "Công ty TNHH Hiền Xa", tax_code: "0101234567", email: "" }) }));
});

it("edits the saved profile against its version and keeps an unknown outcome on the same operation", async () => {
  m.profile = { legal_name: "Công ty TNHH Hiền Xa", tax_code: null, address: "Hà Nội", phone: null, email: null, bank_name: null, bank_account_number: null, bank_account_holder: null, version: 3 };
  m.save.mockResolvedValue({ status: "UNKNOWN", message: "Chưa xác định được kết quả. Bấm lại đúng thao tác này để kiểm tra." });
  render(await Page());
  expect(screen.getByLabelText("Địa chỉ")).toHaveValue("Hà Nội");
  fireEvent.click(screen.getByRole("button", { name: "Lưu thông tin doanh nghiệp" }));
  const retry = await screen.findByRole("button", { name: "Lưu lại đúng thao tác" });
  fireEvent.click(retry);
  await waitFor(() => expect(m.save).toHaveBeenCalledTimes(2));
  expect(m.save.mock.calls[0][0].operationId).toBe(m.save.mock.calls[1][0].operationId);
  expect(m.save.mock.calls[0][0].expectedVersion).toBe(3);
});

it("switches this device to dark mode at once and remembers it", async () => {
  m.cookie = "light.md.noto";
  render(await Page());
  fireEvent.click(screen.getByLabelText("Tối"));
  expect(document.documentElement.getAttribute("data-color")).toBe("dark");
  fireEvent.click(screen.getByLabelText("Lớn"));
  expect(document.documentElement.getAttribute("data-font-size")).toBe("lg");
  expect(document.cookie).toContain("hx-appearance=dark.lg.noto");
  expect(screen.getByText("Đã áp dụng trên thiết bị này.")).toBeInTheDocument();
});
