import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), test: vi.fn(), refresh: vi.fn() }));
vi.mock("@/modules/settings/automation-actions", () => ({ saveAutomationRuleAction: m.save, deleteAutomationRuleAction: m.remove, testAutomationRuleAction: m.test }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
import { AutomationRules } from "./automation-rules";
import type { AutomationOverview } from "@/modules/settings/automation-presentation";

const overview: AutomationOverview = {
  setup: { pg_net: true, pg_cron: true, telegram: false, webhook_secret: false, app_delivery: true },
  push_devices: 2,
  rules: [
    { id: "r1", name: "Đơn khách lớn", event: "order.portal_submitted", min_amount_vnd: "5000000", problems_only: false, channel: "TELEGRAM", target: "-1001234567", active: true, version: 2, updated_at: "2026-10-18T01:00:00Z" },
    { id: "r2", name: "Giao có vấn đề", event: "delivery.result_submitted", min_amount_vnd: null, problems_only: true, channel: "PUSH", target: null, active: false, version: 1, updated_at: "2026-10-18T01:00:00Z" },
  ],
  jobs: [{ id: "j1", channel: "TELEGRAM", title: "Đơn mới từ khách: An Phát", state: "FAILED", attempt: 2, last_error: "Chưa cấu hình Telegram (hx_telegram_bot_token)", created_at: "2026-10-18T02:00:00Z", sent_at: null, rule_name: "Đơn khách lớn" }],
};
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("reads as Khi · Nếu · Thì and shows what was sent and why it waits", () => {
  render(<AutomationRules overview={overview} />);
  const rows = screen.getAllByRole("row");
  expect(within(rows[1]).getByText("Đơn mới khách tự đặt")).toBeInTheDocument();
  expect(within(rows[1]).getByText(/Tổng tiền từ 5\.000\.000/)).toBeInTheDocument();
  expect(within(rows[1]).getByText("-1001234567")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Chỉ giao thiếu / không giao được")).toBeInTheDocument();
  expect(within(rows[2]).getByText("Đang tắt")).toBeInTheDocument();
  expect(screen.getByText(/Gửi lại sau · lần 2/)).toBeInTheDocument();
  expect(screen.getByText("Chưa cấu hình Telegram (hx_telegram_bot_token)")).toBeInTheDocument();
  expect(screen.getByText(/Telegram: chưa có mã bot/)).toBeInTheDocument();
  expect(screen.getByText(/2 máy đã bật nhận/)).toBeInTheDocument();
});

it("creates a rule with an amount condition and a Telegram target", async () => {
  m.save.mockResolvedValue({ ok: true, message: "Đã lưu quy tắc." });
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm quy tắc" }));
  fireEvent.change(screen.getByLabelText("Tên quy tắc"), { target: { value: "Đơn mua lớn" } });
  fireEvent.change(screen.getByLabelText("Khi"), { target: { value: "purchase.draft_ready" } });
  fireEvent.change(screen.getByLabelText(/Nếu tổng tiền từ/), { target: { value: "10000000" } });
  fireEvent.change(screen.getByLabelText("Thì gửi qua"), { target: { value: "TELEGRAM" } });
  fireEvent.change(screen.getByLabelText("Nơi nhận"), { target: { value: "-100999" } });
  fireEvent.click(screen.getByRole("button", { name: "Lưu quy tắc" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ ruleId: null, name: "Đơn mua lớn", event: "purchase.draft_ready",
    minAmountVnd: "10000000", channel: "TELEGRAM", target: "-100999", active: true })));
  await waitFor(() => expect(m.refresh).toHaveBeenCalled());
});

it("offers the problems-only condition just for delivery results and edits with the rule's version", async () => {
  m.save.mockResolvedValue({ ok: false, message: "Quy tắc vừa được người khác sửa. Tải lại trang rồi sửa lại." });
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Sửa" })[1]);
  expect(screen.getByLabelText(/Chỉ khi giao thiếu/)).toBeChecked();
  expect(screen.queryByLabelText(/Nếu tổng tiền từ/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Nơi nhận")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Lưu quy tắc" }));
  await screen.findByRole("alert");
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "r2", expectedVersion: 1, problemsOnly: true, channel: "PUSH" }));
});

it("sends a test and deletes after confirming", async () => {
  m.test.mockResolvedValue({ ok: true, message: "Đã gửi thử." });
  m.remove.mockResolvedValue({ ok: true, message: "Đã xóa quy tắc." });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Gửi thử" })[0]);
  await screen.findByText("Đã gửi thử.");
  expect(m.test).toHaveBeenCalledWith("r1");
  fireEvent.click(screen.getAllByRole("button", { name: "Xóa" })[0]);
  await screen.findByText("Đã xóa quy tắc.");
  expect(m.remove).toHaveBeenCalledWith("r1");
});
