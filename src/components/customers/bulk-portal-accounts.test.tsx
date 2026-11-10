import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ batch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/lib/auth/actions", () => ({ createCustomerPortalAccountsBatchAction: m.batch }));
import { BulkPortalAccounts, bulkAccountsCsv, spacedPhone } from "./bulk-portal-accounts";

const plan = {
  eligible: Array.from({ length: 12 }, (_, index) => ({ id: `id${index}`, code: `KH${index}`, name: `Khách ${index}`, phone: `09123456${String(index).padStart(2, "0")}`, login: "x" })),
  skipped: [{ id: "s1", code: "KH900", name: "Khách thiếu số", reason: "Chưa có số điện thoại" }],
};
beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

it("keeps the leading 0 of a phone in Excel and puts every login in the sheet with its Zalo text (D71)", () => {
  expect(spacedPhone("0912345678")).toBe("0912 345 678");
  const csv = bulkAccountsCsv([
    { customerId: "1", code: "KH001", name: "Khách một", phone: "0912345678", status: "CREATED", password: "abcDEF2345" },
    { customerId: "2", code: "KH002", name: "Khách hai", phone: "", status: "SKIPPED", message: "x" },
  ], "https://erp.example.test");
  expect(csv).toContain('"Mã khách","Tên khách","Số điện thoại (đăng nhập)","Mật khẩu tạm","Tin nhắn gửi Zalo"');
  expect(csv).toContain('"KH001","Khách một","0912 345 678","abcDEF2345"');
  expect(csv).toContain("https://erp.example.test/customer/login");
  expect(csv).not.toContain("KH002");
});

it("previews who is skipped, creates in batches of 10 and offers the sheet at the end (D71)", async () => {
  m.batch.mockImplementation(async (ids: string[]) => ({ results: ids.map((id) => ({ customerId: id, code: id, name: id, phone: "0912345678", status: "CREATED", password: "abcDEF2345" })) }));
  render(<BulkPortalAccounts plan={plan} origin="https://erp.example.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản hàng loạt" }));
  expect(screen.getByText(/khách sẽ có tài khoản/)).toBeInTheDocument();
  expect(screen.getByText("Chưa có số điện thoại")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tạo 12 tài khoản" }));
  await waitFor(() => expect(screen.getByText("Đã tạo 12 tài khoản")).toBeInTheDocument());
  expect(m.batch).toHaveBeenCalledTimes(2);
  expect((m.batch.mock.calls[0][0] as string[]).length).toBe(10);
  expect((m.batch.mock.calls[1][0] as string[]).length).toBe(2);
  expect(screen.getByRole("button", { name: "Tải file Excel (CSV)" })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole("button", { name: "Đóng" }).at(-1)!);
  expect(m.refresh).toHaveBeenCalled();
});

it("stops and says so when a batch cannot be made, keeping what was already created (D71)", async () => {
  m.batch.mockResolvedValueOnce({ results: plan.eligible.slice(0, 10).map((item) => ({ customerId: item.id, code: item.code, name: item.name, phone: item.phone, status: "CREATED", password: "abcDEF2345" })) })
    .mockRejectedValueOnce(new Error("network"));
  render(<BulkPortalAccounts plan={plan} origin="https://erp.example.test" />);
  fireEvent.click(screen.getByRole("button", { name: "Tạo tài khoản hàng loạt" }));
  fireEvent.click(screen.getByRole("button", { name: "Tạo 12 tài khoản" }));
  await waitFor(() => expect(screen.getByText("Đã tạo 10 tài khoản")).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent("Mất kết nối giữa chừng");
});
