import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const createRequest = vi.hoisted(() => vi.fn());
vi.mock("@/modules/finance/payment-request-actions", () => ({ createPaymentRequestAction: createRequest }));
import { DebtPayButton, DebtSelectList } from "./debt-payment";

const options = {
  bank_name: "Vietcombank", account_number: "0071000315", account_holder: "CÔNG TY HIỀN XA", customer_code: "KH-315",
  outstanding_amount_vnd: "4000000", all_note: "TT KH315",
  orders: [{ key: "o1", label: "SO-2026-031501", outstanding_amount_vnd: "2500000", due_date: null, note: "SO2026031501 KH315" }],
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

it("asks for today's amount when opened, shows the QR with the exact amount and note, then confirms the bank payment", async () => {
  fetchMock.mockImplementation((url: string) => url.includes("since=")
    ? json({ paid: fetchMock.mock.calls.length > 2, payment_number: "REC-202610-000042", amount_vnd: "2500000" })
    : json({ options }));
  render(<DebtPayButton customerId="c1" targetKey="o1" label="Thanh toán" />);
  fireEvent.click(screen.getByRole("button", { name: "Thanh toán" }));

  const qr = await screen.findByRole("img", { name: /Mã QR chuyển 2\.500\.000/ });
  const src = new URL(qr.getAttribute("src")!);
  expect(src.searchParams.get("amount")).toBe("2500000");
  expect(src.searchParams.get("des")).toBe("SO2026031501 KH315");
  expect(screen.getByRole("heading", { name: "Thanh toán SO-2026-031501" })).toBeTruthy();
  expect(screen.getByText(/Đang chờ tiền về/)).toBeTruthy();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/portal/debt-payment?customer=c1");

  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(await screen.findByText(/Đã nhận thanh toán 2\.500\.000/)).toBeTruthy();
  expect(screen.getByText(/REC-202610-000042/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(refresh).toHaveBeenCalled();
});

it("says so when the debt was already paid or the shop has not switched bank confirmation on", async () => {
  fetchMock.mockImplementationOnce(() => json({ options: { ...options, orders: [] } }));
  render(<DebtPayButton customerId="c1" targetKey="o1" label="Thanh toán" />);
  fireEvent.click(screen.getByRole("button", { name: "Thanh toán" }));
  expect(await screen.findByText(/đã được thanh toán/)).toBeTruthy();
  cleanup();

  fetchMock.mockImplementationOnce(() => json({ options: null }));
  render(<DebtPayButton customerId="c1" targetKey="ALL" label="Thanh toán tất cả" primary />);
  fireEvent.click(screen.getByRole("button", { name: "Thanh toán tất cả" }));
  expect(await screen.findByText(/chưa bật thanh toán tự xác nhận/)).toBeTruthy();
});

const request = {
  id: "11111111-1111-4111-8111-111111111111", code: "YC7K2MQ", state: "OPEN", amount_vnd: "8000000", received_amount_vnd: "0", remaining_amount_vnd: "8000000",
  note: "SEVQR TT KH315 YC7K2MQ", created_via: "PORTAL", created_at: "2026-11-01T05:00:00Z", expires_at: "2026-11-08T05:00:00Z",
  bank_name: "Vietcombank", account_number: "0071000315", account_holder: "CÔNG TY HIỀN XA",
  lines: [{ label: "SO-2026-000101", due_date: "2026-11-05", amount_vnd: "3000000", outstanding_amount_vnd: "3000000" },
    { label: "SO-2026-000102", due_date: "2026-11-10", amount_vnd: "5000000", outstanding_amount_vnd: "5000000" }],
};
const rows = [
  { key: "o101", label: "SO-2026-000101", dueLabel: "Quá hạn 2 ngày", dueTone: "overdue", amountVnd: "3000000" },
  { key: "o102", label: "SO-2026-000102", dueLabel: "Còn 9 ngày", dueTone: "later", amountVnd: "5000000" },
  { key: "o103", label: "SO-2026-000103", dueLabel: "Còn 14 ngày", dueTone: "later", amountVnd: "2000000" },
];

it("D44: ticks several debts, shows their total, and pays them with one QR whose note carries the request code", async () => {
  createRequest.mockResolvedValue({ status: "SUCCESS", request });
  fetchMock.mockImplementation(() => json({ paid: false }));
  render(<DebtSelectList customerId="c1" rows={rows} />);
  expect(screen.queryByRole("region", { name: "Các khoản đã chọn" })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn SO-2026-000101" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Chọn SO-2026-000102" }));
  const bar = screen.getByRole("region", { name: "Các khoản đã chọn" });
  expect(bar.textContent).toContain("Đã chọn 2 khoản");
  expect(bar.textContent).toContain("8.000.000");
  fireEvent.click(screen.getByRole("button", { name: "Thanh toán 2 khoản đã chọn" }));

  const qr = await screen.findByRole("img", { name: /Mã QR chuyển 8\.000\.000/ });
  const src = new URL(qr.getAttribute("src")!);
  expect(src.searchParams.get("amount")).toBe("8000000");
  expect(src.searchParams.get("des")).toBe("SEVQR TT KH315 YC7K2MQ");
  expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c1", keys: ["o101", "o102"] }));
  expect(createRequest.mock.calls[0][0].operationId).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByRole("list", { name: "Các khoản trong lần thanh toán này" }).textContent).toContain("SO-2026-000102");
});

it("D44: quick choices select the overdue debts or everything, and a refusal is shown in Vietnamese", async () => {
  createRequest.mockResolvedValue({ status: "FAILED", message: "Các khoản đã chọn không còn nợ. Tải lại trang để xem công nợ mới nhất." });
  render(<DebtSelectList customerId="c1" rows={rows} />);
  fireEvent.click(screen.getByRole("button", { name: "Chọn các khoản quá hạn" }));
  expect((screen.getByRole("checkbox", { name: "Chọn SO-2026-000101" }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox", { name: "Chọn SO-2026-000102" }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Chọn tất cả" }));
  expect(screen.getByRole("region", { name: "Các khoản đã chọn" }).textContent).toContain("10.000.000");
  fireEvent.click(screen.getByRole("button", { name: "Thanh toán 3 khoản đã chọn" }));
  expect((await screen.findByRole("alert")).textContent).toContain("không còn nợ");
});
