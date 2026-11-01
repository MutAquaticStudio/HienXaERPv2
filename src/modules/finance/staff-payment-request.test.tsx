import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), cancel: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("./payment-request-actions", () => ({ createPaymentRequestAction: m.create, cancelPaymentRequestAction: m.cancel, confirmCashPaymentAction: m.confirm }));

import { paymentShareText, StaffPaymentRequestPanel } from "./staff-payment-request";

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const options = {
  qr_enabled: true, bank_name: "Vietcombank", account_number: "0071000318", account_holder: "Hiền Xa", customer_code: "KH003", outstanding_amount_vnd: "10000000", all_note: "TT KH003",
  orders: [
    { key: "o101", label: "SO-2026-000101", outstanding_amount_vnd: "3000000", due_date: "2026-11-05", note: "SO2026000101 KH003" },
    { key: "o102", label: "SO-2026-000102", outstanding_amount_vnd: "7000000", due_date: "2026-11-10", note: "SO2026000102 KH003" },
  ],
};
const request = {
  id: "33333333-3333-4333-8333-333333333333", code: "YC7K2MQ", method: "BANK_QR" as const, state: "OPEN" as const, amount_vnd: "10000000", received_amount_vnd: "0", remaining_amount_vnd: "10000000",
  note: "TT KH003 YC7K2MQ", created_via: "STAFF" as const, created_at: "2026-11-01T05:00:00Z", expires_at: "2026-11-08T05:00:00Z",
  bank_name: "Vietcombank", account_number: "0071000318", account_holder: "Hiền Xa",
  lines: [{ label: "SO-2026-000101", due_date: "2026-11-05", amount_vnd: "3000000", outstanding_amount_vnd: "3000000" },
    { label: "SO-2026-000102", due_date: "2026-11-10", amount_vnd: "7000000", outstanding_amount_vnd: "7000000" }],
};

it("the message for Zalo has the debts, the bank, the exact note and a QR link", () => {
  const text = paymentShareText(request);
  expect(text).toContain("2 khoản, tổng 10.000.000");
  expect(text).toContain("- SO-2026-000102: 7.000.000");
  expect(text).toContain("Nội dung (giữ nguyên để hệ thống tự xác nhận): TT KH003 YC7K2MQ");
  expect(text).toMatch(/Mã QR: https:\/\/vietqr\.app\/img\?.*amount=10000000/);
});

it("staff tick debts, make the QR once, and can cancel an open request", async () => {
  m.create.mockResolvedValue({ status: "SUCCESS", request });
  m.cancel.mockResolvedValue({ status: "SUCCESS", message: "Đã hủy yêu cầu thanh toán." });
  render(<StaffPaymentRequestPanel customerId="c1" options={options} requests={[{ id: request.id, code: "YC9ABCD", method: "BANK_QR", state: "OPEN", amount_vnd: "500000", received_amount_vnd: "0", created_via: "PORTAL", created_at: "2026-10-31T05:00:00Z" }]} />);
  const button = screen.getByRole("button", { name: "Tạo QR thu nợ" });
  expect(button).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn SO-2026-000101" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn SO-2026-000102" }));
  expect(screen.getByText("Đã chọn 2 khoản · 10.000.000 ₫")).toBeTruthy();
  fireEvent.click(button);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("img", { name: /Mã QR chuyển 10\.000\.000/ })).toBeTruthy();
  expect(within(dialog).getByRole("button", { name: "Sao chép tin nhắn gửi khách" })).toBeTruthy();
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c1", keys: ["o101", "o102"] }));

  fireEvent.click(within(dialog).getByRole("button", { name: /Đóng/ }));
  fireEvent.click(screen.getByRole("button", { name: "Hủy" }));
  expect(await screen.findByText("Đã hủy yêu cầu thanh toán.")).toBeTruthy();
  expect(m.cancel).toHaveBeenCalledWith(expect.objectContaining({ requestId: request.id, customerId: "c1" }));
});

it("without SePay offers cash only, and explains what to switch on for the QR", () => {
  render(<StaffPaymentRequestPanel customerId="c1" options={{ ...options, qr_enabled: false, bank_name: null, account_number: null, account_holder: null }} requests={[]}
    canPostPayment cashAccounts={[{ id: "f1", name: "Quỹ tiền mặt" }]} />);
  expect(screen.queryByRole("button", { name: "Tạo QR thu nợ" })).toBeNull();
  expect(screen.getByRole("button", { name: "Thu tiền mặt" })).toBeTruthy();
  expect(screen.getByText(/Hiện cho khách.*Tự ghi tiền về/)).toBeTruthy();
});

it("D45: staff take cash now — a cash request, then the accountant confirms the amount actually received into a cash fund", async () => {
  m.create.mockResolvedValue({ status: "SUCCESS", request: { ...request, method: "CASH", note: "TT KH003 YC7K2MQ", bank_name: null, account_number: null, account_holder: null } });
  m.confirm.mockResolvedValue({ status: "SUCCESS", message: "Đã ghi phiếu thu tiền mặt và trừ công nợ các khoản đã chọn." });
  render(<StaffPaymentRequestPanel customerId="c1" options={options} requests={[]} canPostPayment cashAccounts={[{ id: "f1", name: "Quỹ tiền mặt" }, { id: "f2", name: "Két 2" }]} />);
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn SO-2026-000101" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn SO-2026-000102" }));
  fireEvent.click(screen.getByRole("button", { name: "Thu tiền mặt" }));
  const dialog = await screen.findByRole("dialog", { name: /Xác nhận đã thu YC7K2MQ/ });
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c1", keys: ["o101", "o102"], method: "CASH" }));
  const amount = within(dialog).getByLabelText("Số tiền thực nhận") as HTMLInputElement;
  expect(amount.value).toBe("10.000.000");
  fireEvent.change(amount, { target: { value: "9.500.000" } });
  fireEvent.change(within(dialog).getByLabelText("Quỹ tiền mặt"), { target: { value: "f2" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Xác nhận đã thu" }));
  expect(await screen.findByText("Đã ghi phiếu thu tiền mặt và trừ công nợ các khoản đã chọn.")).toBeTruthy();
  expect(m.confirm).toHaveBeenCalledWith(expect.objectContaining({ requestId: request.id, amountVnd: "9500000", accountId: "f2", customerId: "c1" }));
});

it("people without finance.payment.post cannot take cash", () => {
  render(<StaffPaymentRequestPanel customerId="c1" options={options} requests={[{ id: request.id, code: "YC9ABCD", method: "CASH", state: "OPEN", amount_vnd: "500000", received_amount_vnd: "0", created_via: "PORTAL", created_at: "2026-10-31T05:00:00Z" }]} />);
  expect(screen.queryByRole("button", { name: "Thu tiền mặt" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Xác nhận đã thu" })).toBeNull();
  expect(screen.getByText("Tiền mặt")).toBeTruthy();
});
