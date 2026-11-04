import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ start: vi.fn(), save: vi.fn(), mode: vi.fn(), test: vi.fn(), disconnect: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/modules/zalo/actions", () => ({ saveZaloTemplateAction: m.save, setZaloModeAction: m.mode, sendZaloTestAction: m.test, disconnectZaloAction: m.disconnect }));
vi.mock("@/modules/zalo/connect-actions", () => ({ startZaloOAuthAction: m.start }));
import { ZaloSettings } from "./zalo-settings";
import type { ZaloStatus } from "@/modules/zalo/presentation";

const status: ZaloStatus = {
  state: "DISCONNECTED", app_id: null, oa_id: null, send_mode: "development", access_expires_at: null, refresh_expires_at: null, connected_at: null,
  daily_quota: null, remaining_quota: null, last_error: null, app_secret_set: false, last_24h: { sent: 0, waiting: 0, dead: 0 },
  templates: [
    { event_code: "ORDER_CONFIRMED", template_id: null, active: false, version: 1, params: ["order_code", "order_date", "total", "site"] },
    { event_code: "DELIVERY_DONE", template_id: null, active: false, version: 1, params: ["delivery_code", "site", "delivered_at", "receiver"] },
    { event_code: "PAYMENT_RECEIVED", template_id: "222", active: true, version: 3, params: ["amount", "customer", "paid_at", "balance"] },
    { event_code: "DEBT_REMINDER", template_id: null, active: false, version: 1, params: ["customer", "balance", "due_date"] },
  ],
};
beforeEach(() => { m.save.mockResolvedValue({ ok: true, message: "Đã lưu và bật gửi tin này." }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("guides the owner before connecting and lists each event with its template parameters", () => {
  render(<ZaloSettings status={status} />);
  expect(screen.getByText("Chưa kết nối")).toBeInTheDocument();
  expect(screen.getByText("hx_zalo_app_secret")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Kết nối Zalo OA" })).toBeDisabled();
  expect(screen.getByRole("group", { name: "Đơn được xác nhận", hidden: true })).toBeInTheDocument();
  expect(screen.queryByText("24 giờ qua")).not.toBeInTheDocument();
  expect(screen.getByText("delivered_at")).toBeInTheDocument();
  expect(screen.getByText("Kết nối Zalo OA và nhập ít nhất một mã mẫu tin để gửi thử.")).toBeInTheDocument();
});

it("shows Zalo's refusal when connecting fails and saves a template with its version", async () => {
  m.start.mockResolvedValue({ ok: false, message: "Chưa lưu khóa bí mật của Zalo App (hx_zalo_app_secret) trong Supabase Vault." });
  render(<ZaloSettings status={status} />);
  fireEvent.change(screen.getByLabelText("App ID (developers.zalo.me)"), { target: { value: "1234567" } });
  fireEvent.click(screen.getByRole("button", { name: "Kết nối Zalo OA" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Chưa lưu khóa bí mật"));
  // D59: before connecting, the templates are folded; each row's controls carry the event's name; "Lưu" wakes on a change.
  // (Folded rows are out of the accessibility tree in jsdom, so the button is found by its text.)
  const save = screen.getAllByRole("button", { hidden: true }).find((button) => button.textContent === "Lưu mẫu Đơn được xác nhận")!;
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Mã mẫu tin (template ID) — Đơn được xác nhận"), { target: { value: "111" } });
  fireEvent.click(screen.getByLabelText("Bật gửi Đơn được xác nhận"));
  expect(screen.getAllByText("Chưa lưu", { selector: ".settings-dirty" })).toHaveLength(1);
  fireEvent.click(save);
  await waitFor(() => expect(m.save).toHaveBeenCalledWith({ event: "ORDER_CONFIRMED", templateId: "111", active: true, version: 1 }));
});
