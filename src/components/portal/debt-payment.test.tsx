import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
import { DebtPayButton } from "./debt-payment";

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
