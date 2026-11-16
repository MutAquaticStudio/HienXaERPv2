import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), test: vi.fn(), preview: vi.fn(), builtin: vi.fn(), quiet: vi.fn(), refresh: vi.fn() }));
vi.mock("@/modules/settings/automation-actions", () => ({ saveAutomationRuleAction: m.save, deleteAutomationRuleAction: m.remove, testAutomationRuleAction: m.test,
  sendTestPushAction: m.preview, setBuiltinPushAction: m.builtin, saveQuietHoursAction: m.quiet }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
import { AutomationRules } from "./automation-rules";
import type { AutomationOverview } from "@/modules/settings/automation-presentation";

const owner = "11111111-1111-4111-8111-111111111111";
const lan = "22222222-2222-4222-8222-222222222222";
const tu = "33333333-3333-4333-8333-333333333333";
const minh = "44444444-4444-4444-8444-444444444444";
const ownerRole = "55555555-5555-4555-8555-555555555555";
const storeRole = "66666666-6666-4666-8666-666666666666";
const overview: AutomationOverview = {
  setup: { pg_net: true, pg_cron: true, webhook_secret: false, app_delivery: true },
  push_devices: 4, my_devices: 2,
  people: [
    { id: owner, name: "Chủ cửa hàng", role_id: ownerRole, role_name: "Chủ cửa hàng", devices: 2, permissions: ["orders.confirm", "orders.read", "delivery.verify", "finance.ar.read"] },
    { id: lan, name: "Nguyễn Lan", role_id: ownerRole, role_name: "Chủ cửa hàng", devices: 1, permissions: ["orders.confirm", "orders.read"] },
    { id: minh, name: "Trần Minh", role_id: ownerRole, role_name: "Chủ cửa hàng", devices: 0, permissions: ["orders.confirm"] },
    { id: tu, name: "Phạm Tú", role_id: storeRole, role_name: "Kho", devices: 1, permissions: ["inventory.read"] },
  ],
  roles: [{ id: ownerRole, name: "Chủ cửa hàng" }, { id: storeRole, name: "Kho" }],
  customers: { people: 5, devices: 3 },
  builtins: { "announcement.office_price": false },
  quiet_hours: null,
  rules: [
    { id: "r1", name: "Đơn khách mới → báo người duyệt", event: "order.portal_submitted", min_amount_vnd: "5000000", problems_only: false, channels: ["PUSH", "WEBHOOK"],
      target: "https://hooks.example.test/x", active: true, version: 2, updated_at: "2026-11-16T01:00:00Z", recipient_mode: "PEOPLE", role_ids: [], employee_ids: [owner, lan] },
    { id: "r2", name: "Giao có vấn đề", event: "delivery.result_submitted", min_amount_vnd: null, problems_only: true, channels: ["PUSH"], target: null, active: false,
      version: 1, updated_at: "2026-11-16T01:00:00Z", recipient_mode: "PERMISSION", role_ids: [], employee_ids: [] },
  ],
  jobs: [{ id: "j1", channel: "PUSH", title: "Đơn mới từ khách: An Phát", state: "HELD", attempt: 0, last_error: null, created_at: "2026-11-16T15:00:00Z", sent_at: null, rule_name: "Đơn khách lớn" },
    { id: "j2", channel: "PUSH", title: "Việc mới", state: "FAILED", attempt: 2, last_error: "Chưa cấu hình gửi qua ứng dụng (hx_app_url, hx_automation_secret)", created_at: "2026-11-16T14:00:00Z", sent_at: null, rule_name: null }],
};
beforeEach(() => { vi.clearAllMocks(); m.save.mockResolvedValue({ ok: true, message: "Đã lưu quy tắc." }); });
afterEach(cleanup);

const group = (name: string) => screen.getByRole("region", { name });
const row = (region: HTMLElement, text: string) => within(region).getByText(text).closest("li") as HTMLElement;

it("lists every notification grouped, with who receives it, through what and how many devices", () => {
  render(<AutomationRules overview={overview} />);
  const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
  expect(headings).toEqual(["Bán hàng", "Mua hàng", "Giao hàng & điều phối", "Thợ", "Khách hàng", "Công nợ & kho", "Tin cập nhật"]);
  const sale = row(group("Bán hàng"), "Đơn khách mới → báo người duyệt");
  expect(within(sale).getByText("Chủ cửa hàng, Nguyễn Lan")).toBeInTheDocument();
  expect(within(sale).getByText("2 người · 3 máy đang bật")).toBeInTheDocument();
  expect(within(sale).getByText(/Từ 5\.000\.000/)).toBeInTheDocument();
  expect(within(sale).getAllByText("Webhook")[0]).toBeInTheDocument();
  expect(within(row(group("Bán hàng"), "Khách hủy đơn")).getByRole("button", { name: "Báo về điện thoại: Khách hủy đơn" })).toHaveTextContent("+ Báo về điện thoại");
  const problem = row(group("Giao hàng & điều phối"), "Giao có vấn đề");
  expect(within(problem).getByText(/Đang tắt/)).toBeInTheDocument();
  expect(within(problem).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  // Customers: the D93 customer pushes are built-ins with a switch, and the account counts.
  const customers = group("Khách hàng");
  expect(within(row(customers, "Đã nhận tiền")).getByText("Chủ tài khoản và Kế toán của khách")).toBeInTheDocument();
  expect(within(row(customers, "Xe đang đến")).getByText("5 tài khoản · 3 máy đang bật")).toBeInTheDocument();
  expect(within(row(group("Tin cập nhật"), "Giá chung đổi")).getByRole("switch")).toHaveAttribute("aria-checked", "false");
  expect(screen.getByText("3 người · 4 máy")).toBeInTheDocument();
  expect(screen.getByText("5 tài khoản · 3 máy")).toBeInTheDocument();
  expect(screen.getByText(/Tắt thông báo có sẵn chỉ dừng báo về điện thoại/)).toBeInTheDocument();
});

it("filters to phone, app-only and the Owner's own rules, with an empty state", () => {
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getByRole("button", { name: /^Chỉ trong app/ }));
  expect(screen.queryByText("Đơn khách mới → báo người duyệt")).not.toBeInTheDocument();
  expect(screen.getByText("Khách hủy đơn")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^Báo về điện thoại \(/ }));
  expect(screen.getByText("Đơn khách mới → báo người duyệt")).toBeInTheDocument();
  expect(screen.queryByText("Giao có vấn đề")).not.toBeInTheDocument();
  expect(screen.queryByText("Giá chung đổi")).not.toBeInTheDocument();
  cleanup();
  render(<AutomationRules overview={{ ...overview, rules: [] }} />);
  fireEvent.click(screen.getByRole("button", { name: /^Do anh\/chị đặt/ }));
  expect(screen.getByText("Chưa có quy tắc nào do anh/chị đặt")).toBeInTheDocument();
});

it("adds a phone push for an app-only kind and switches built-ins and rules", async () => {
  m.builtin.mockResolvedValue({ ok: true, message: "Đã tắt báo về điện thoại. Thông báo trong app vẫn hiện." });
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getByRole("button", { name: "Báo về điện thoại: Nợ quá hạn" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ ruleId: null, event: "finance.overdue_digest", channels: ["PUSH"],
    recipientMode: "PERMISSION", name: "Nợ quá hạn → báo điện thoại", active: true })));
  await screen.findByText(/Đã bật báo về điện thoại cho “Nợ quá hạn”/);
  fireEvent.click(within(row(group("Thợ"), "Phiếu giao chờ người nhận")).getByRole("switch"));
  await waitFor(() => expect(m.builtin).toHaveBeenCalledWith({ key: "delivery.pool_open", enabled: false }));
  await screen.findByText("Đã tắt báo về điện thoại. Thông báo trong app vẫn hiện.");
  fireEvent.click(within(row(group("Giao hàng & điều phối"), "Giao có vấn đề")).getByRole("switch"));
  await waitFor(() => expect(m.save).toHaveBeenLastCalledWith(expect.objectContaining({ ruleId: "r2", expectedVersion: 1, active: true, problemsOnly: true })));
});

it("walks through the six steps: event, condition, people (with permission and devices), channels, preview + own test, save", async () => {
  m.preview.mockResolvedValue({ ok: true, message: "Đã gửi thử tới 2 máy của anh/chị." });
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getByRole("button", { name: "+ Thêm quy tắc" }));
  expect(screen.getByText("Bước 1/6")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Chọn một việc xảy ra.");
  fireEvent.change(screen.getByLabelText("Tìm sự kiện"), { target: { value: "khách mới" } });
  fireEvent.click(screen.getByRole("radio", { name: /Đơn khách mới/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  expect(screen.getByText("Bước 2/6")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Chỉ khi tổng tiền từ/), { target: { value: "50000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  // Step 3: by person. Phạm Tú (Kho) may not see new orders: disabled. Trần Minh has no device: warned.
  fireEvent.click(screen.getByRole("radio", { name: /Chọn người/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Chọn ít nhất một người.");
  expect(screen.getByRole("checkbox", { name: /Phạm Tú/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: /Chủ cửa hàng · Chủ cửa hàng/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Nguyễn Lan/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Trần Minh/ }));
  expect(screen.getByText("3 người được chọn · 2 người, 3 máy đang bật thông báo")).toBeInTheDocument();
  expect(screen.getByText(/Trần Minh sẽ chỉ thấy ở chuông trong app/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  // Step 4: phone and webhook at once; the webhook needs its address.
  fireEvent.click(screen.getByRole("checkbox", { name: /Webhook/ }));
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  expect(screen.getByRole("alert")).toHaveTextContent("https://");
  fireEvent.change(screen.getByLabelText("Địa chỉ webhook"), { target: { value: "https://hooks.example.test/n8n" } });
  expect(screen.queryByText(/Telegram/)).toHaveTextContent("Telegram và email không còn dùng cho quy tắc");
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục" }));
  // Step 5: preview, test only to my devices.
  expect(screen.getByLabelText("Xem trước thông báo trên điện thoại")).toHaveTextContent("Đơn mới từ khách: Anh Tuấn");
  expect(screen.getByText("Chỉ tới 2 máy của anh/chị — không gửi cho 3 người nhận, không gửi webhook.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Gửi thử cho tôi" }));
  await screen.findByText("Đã gửi thử tới 2 máy của anh/chị.");
  expect(m.preview).toHaveBeenCalledWith(expect.objectContaining({ title: "Đơn mới từ khách: Anh Tuấn" }));
  fireEvent.click(screen.getByRole("button", { name: "Tiếp tục: Lưu" }));
  expect(screen.getByLabelText("Tên quy tắc")).toHaveValue("Đơn khách mới → báo Chủ cửa hàng, Nguyễn Lan, Trần Minh");
  expect(screen.getAllByText(/Khi đơn khách mới từ 50\.000\.000/)[0]).toHaveTextContent("qua điện thoại và webhook");
  fireEvent.click(screen.getByRole("button", { name: "Lưu quy tắc" }));
  await waitFor(() => expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ ruleId: null, event: "order.portal_submitted", minAmountVnd: "50000000",
    channels: ["PUSH", "WEBHOOK"], target: "https://hooks.example.test/n8n", recipientMode: "PEOPLE", employeeIds: [owner, lan, minh], active: true })));
  await screen.findByText("Đã lưu quy tắc.");
  expect(m.refresh).toHaveBeenCalled();
});

it("edits a rule with its version and offers a fresh copy when someone else changed it", async () => {
  m.save.mockResolvedValue({ ok: false, message: "Vừa có người khác sửa trên máy khác. Tải bản mới rồi sửa lại — thay đổi của anh/chị chưa được lưu." });
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getByRole("button", { name: "Sửa quy tắc Giao có vấn đề" }));
  expect(screen.getByText("Bước 3/6")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Bước 2: Điều kiện" }));
  expect(screen.getByRole("checkbox", { name: /Chỉ khi giao thiếu/ })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "Bước 6: Lưu" }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu quy tắc" }));
  await screen.findByRole("alert");
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({ ruleId: "r2", expectedVersion: 1, problemsOnly: true, channels: ["PUSH"] }));
  fireEvent.click(screen.getByRole("button", { name: "Tải bản mới" }));
  expect(m.refresh).toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Bán hàng" })).toBeInTheDocument();
});

it("tests a rule on my devices only and deletes only after confirming (D59)", async () => {
  m.test.mockResolvedValue({ ok: true, message: "Đã gửi thử tới 2 máy của anh/chị." });
  m.remove.mockResolvedValue({ ok: true, message: "Đã xóa quy tắc." });
  render(<AutomationRules overview={overview} />);
  fireEvent.click(screen.getByRole("button", { name: "Gửi thử quy tắc Đơn khách mới → báo người duyệt" }));
  const dialog = await screen.findByRole("dialog", { name: "Gửi thử quy tắc?" });
  expect(dialog).toHaveTextContent("chỉ gửi tới 2 máy của anh/chị");
  fireEvent.click(within(dialog).getByRole("button", { name: "Gửi thử" }));
  await screen.findByText("Đã gửi thử tới 2 máy của anh/chị.");
  expect(m.test).toHaveBeenCalledWith("r1");
  fireEvent.click(screen.getByRole("button", { name: "Xóa quy tắc Giao có vấn đề" }));
  fireEvent.click(within(await screen.findByRole("dialog", { name: "Xóa quy tắc?" })).getByRole("button", { name: "Không, quay lại" }));
  expect(m.remove).not.toHaveBeenCalled();
});

it("sets quiet hours and shows held and merged pushes in the history", async () => {
  m.quiet.mockResolvedValue({ ok: true, message: "Đã lưu giờ yên lặng." });
  render(<AutomationRules overview={overview} />);
  expect(screen.getByRole("button", { name: /Giờ yên lặng.*Đang tắt/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Giờ yên lặng" }));
  fireEvent.click(screen.getByRole("checkbox", { name: /Bật giờ yên lặng/ }));
  expect(screen.getByLabelText("Từ")).toHaveValue("21:00");
  fireEvent.change(screen.getByLabelText("Đến"), { target: { value: "21:00" } });
  expect(screen.getByText("Giờ bắt đầu và giờ kết thúc phải khác nhau.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Lưu giờ yên lặng" }));
  expect(m.quiet).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Đến"), { target: { value: "06:30" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Đơn khách mới/ }));
  fireEvent.click(screen.getByRole("button", { name: "Lưu giờ yên lặng" }));
  await waitFor(() => expect(m.quiet).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, startMinute: 1260, endMinute: 390, expectedVersion: null,
    exemptKeys: ["worker_jobs", "delivery_problems", "order.portal_submitted"] })));
  await screen.findByText("Đã lưu giờ yên lặng.");
  fireEvent.click(screen.getByRole("tab", { name: "Lịch sử gửi" }));
  expect(screen.getByText("Chờ hết giờ yên lặng")).toBeInTheDocument();
  expect(screen.getByText("Chưa cấu hình gửi qua ứng dụng")).toBeInTheDocument();
});
