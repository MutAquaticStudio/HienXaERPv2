import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/modules/purchasing/dispatch-actions", () => ({ recordPurchaseOrderSentAction: m.record }));
import { SendToSupplier, supplierMessage, zaloLink, type SendablePurchaseOrder } from "./send-to-supplier";

const order: SendablePurchaseOrder = { id: "po1", number: "PO-2026-000012", supplierName: "Gạch Đồng Tâm", supplierPhone: "0912 345 678", supplierEmail: "ban@dongtam.vn",
  destinationName: "Công trình Nhà anh Ba", destinationAddress: "Thôn Đông, Hiền Xa", expectedAt: "2026-10-20T02:00:00Z",
  lines: [{ name: "Gạch đặc", quantity: "1.500", unit: "viên" }], contact: "Anh Ba · 0901 000 111", companyName: "Công ty Hiền Xa" };
beforeEach(() => { vi.clearAllMocks(); m.record.mockResolvedValue({ status: "SUCCESS", message: "ok", sentAt: "2026-10-18T03:00:00Z" }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("writes what the supplier needs: goods, place, date, who receives", () => {
  const text = supplierMessage(order);
  expect(text).toContain("Đơn mua PO-2026-000012 — Công ty Hiền Xa");
  expect(text).toContain("• Gạch đặc: 1.500 viên");
  expect(text).toContain("Giao tới: Công trình Nhà anh Ba — Thôn Đông, Hiền Xa");
  expect(text).toContain("Ngày giao: 20/10/2026 09:00");
  expect(text).toContain("Liên hệ nhận hàng: Anh Ba · 0901 000 111");
  expect(zaloLink("0912 345 678")).toBe("https://zalo.me/0912345678");
  expect(zaloLink("+84 912 345 678")).toBe("https://zalo.me/0912345678");
  expect(zaloLink("abc")).toBeNull();
});

it("on a phone shares the PDF and text, then records the send", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, share, canShare: () => true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF"], { type: "application/pdf" }) }));
  render(<SendToSupplier order={order} lastSent={null} />);
  expect(screen.getByText("Chưa gửi NCC.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Gửi NCC qua Zalo" }));
  await waitFor(() => expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrderId: "po1", channel: "ZALO" })));
  expect(share.mock.calls[0][0].files[0].name).toBe("PO-2026-000012.pdf");
  expect(share.mock.calls[0][0].text).toContain("Gạch đặc");
  expect(await screen.findByText(/Đã gửi NCC .* · Zalo/)).toBeInTheDocument();
});

it("records nothing when the person closes the share sheet", async () => {
  vi.stubGlobal("navigator", { ...navigator, share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })), canShare: () => true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["%PDF"]) }));
  render(<SendToSupplier order={order} lastSent={{ at: "2026-10-17T02:00:00Z", channel: "EMAIL" }} />);
  expect(screen.getByText(/Đã gửi NCC .* · Email/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Gửi NCC qua Zalo" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Gửi NCC qua Zalo" })).not.toBeDisabled());
  expect(m.record).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "Mở Zalo NCC" })).toHaveAttribute("href", "https://zalo.me/0912345678");
  expect(screen.getByRole("link", { name: "Gửi email" }).getAttribute("href")).toMatch(/^mailto:ban@dongtam\.vn\?subject=/);
});
