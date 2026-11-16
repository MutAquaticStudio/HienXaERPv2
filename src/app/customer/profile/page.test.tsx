import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn(), inApp: vi.fn(async () => false), oldApp: vi.fn(async () => false), appearance: undefined as string | undefined, history: vi.fn(async (): Promise<unknown[] | null> => []) }));
vi.mock("@/modules/announcements/server", () => ({ loadAnnouncementHistory: m.history }));
vi.mock("@/components/notifications/push-toggle", () => ({ PushToggle: () => <button type="button">Bật thông báo trên máy này</button> }));
vi.mock("@/lib/app-shell/server", () => ({ openedInNativeApp: m.inApp, openedInAppWithoutPush: m.oldApp }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "hx-appearance" && m.appearance ? { value: m.appearance } : undefined }) }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: m.client, portalRpc: m.rpc }));
vi.mock("@/modules/zalo/notify-actions", () => ({ setCustomerZaloNotifyAction: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import CustomerAccountPage from "./page";

const account = {
  customer: { id: "c1", code: "KH01", display_name: "Khách demo KH01", customer_type: "BUSINESS", phone: "0900000000", address_text: "12 Đại Linh",
    tax_code: "0101", payment_terms_days: 15 },
  membership_role: "OWNER",
  sites: [{ id: "s1", name: "Địa chỉ giao demo", address_text: "12 Đại Linh", receiver_name: "Anh Ba", receiver_phone: "0901" }],
};
beforeEach(() => {
  vi.clearAllMocks();
  m.client.mockResolvedValue({ supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) }, user: { email: "0900000000@sdt.hienxavlxd.com", last_sign_in_at: "2026-10-22T01:00:00Z" } });
  m.rpc.mockResolvedValue(account);
});
afterEach(cleanup);

it("shows how the customer signs in, their details and delivery addresses (FB7)", async () => {
  render(await CustomerAccountPage());
  expect(m.rpc).toHaveBeenCalledWith(expect.anything(), "customer_portal_account", { target_customer_id: null });
  const login = screen.getByRole("region", { name: "Đăng nhập" });
  expect(within(login).getByText("Số điện thoại đăng nhập")).toBeInTheDocument();
  expect(within(login).getByText("0900000000")).toBeInTheDocument();
  expect(within(login).getByText("22/10/2026 08:00")).toBeInTheDocument();
  expect(within(login).getByRole("link", { name: "Đổi mật khẩu" })).toHaveAttribute("href", "/customer/change-password?from=account");
  expect(within(login).getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  const details = screen.getByRole("region", { name: "Thông tin khách hàng" });
  expect(within(details).getByText("KH01")).toBeInTheDocument();
  expect(within(details).getByText("Doanh nghiệp")).toBeInTheDocument();
  expect(within(details).getByText("15 ngày sau khi giao")).toBeInTheDocument();
  expect(within(details).getByText("Chưa cập nhật")).toBeInTheDocument();
  const sites = screen.getByRole("region", { name: "Địa chỉ giao hàng (1)" });
  expect(within(sites).getByText("Anh Ba · 0901")).toBeInTheDocument();
});

it("sends a signed-out visitor to the customer sign-in", async () => {
  m.client.mockResolvedValueOnce(null);
  await expect(CustomerAccountPage()).rejects.toThrow("redirect:/customer/login");
});

it("D47: the customer's owner can switch Zalo notifications off", async () => {
  render(await CustomerAccountPage());
  expect(screen.getByRole("checkbox", { name: "Nhận thông báo qua Zalo" })).toBeChecked();
});

it("D84: Tài khoản has Giao diện with this device's saved choice", async () => {
  m.appearance = "system.md.noto";
  render(await CustomerAccountPage());
  const section = screen.getByRole("region", { name: "Giao diện" });
  expect(within(section).getByLabelText("Theo thiết bị")).toBeChecked();
  expect(within(section).getByLabelText("Vừa")).toBeChecked();
  m.appearance = undefined;
});

it("D83: the store's announcements, own price lines only, and push on this phone (D86: also in the app 2.3.0+, not in an older app)", async () => {
  m.history.mockResolvedValueOnce([{ id: "10000000-0000-4000-8000-000000000083", audience: "CUSTOMER", kind: "PRICE", label: null,
    title: "Giá mới từ thứ Hai, 16/11/2026", body: "Cửa hàng điều chỉnh giá 1 mặt hàng của bạn.", link: null, effective_at: "2026-11-16T00:00:00+07:00",
    created_at: "2026-11-15T02:12:00Z", updated_at: "2026-11-15T02:12:00Z", seen_at: null,
    lines: [{ code: "XM40", name: "Xi măng PCB40", unit: "Bao", old: "95000", old_kind: "VND", new: "98000", new_kind: "VND" }] }]);
  render(await CustomerAccountPage());
  expect(m.history).toHaveBeenCalledWith("CUSTOMER");
  const news = screen.getByRole("region", { name: "Thông báo từ cửa hàng" });
  expect(within(news).getByText("Giá mới từ thứ Hai, 16/11/2026")).toBeInTheDocument();
  expect(within(news).getByText("Tăng 3.000 ₫")).toBeInTheDocument();
  expect(within(news).getByText("Chưa xem")).toBeInTheDocument();
  const push = screen.getByRole("region", { name: "Thông báo trên điện thoại" });
  expect(within(push).getByRole("button", { name: "Bật thông báo trên máy này" })).toBeInTheDocument();
  cleanup();
  m.inApp.mockResolvedValueOnce(true);
  render(await CustomerAccountPage());
  expect(screen.getByRole("region", { name: "Thông báo trên điện thoại" })).toBeInTheDocument();
  cleanup();
  m.inApp.mockResolvedValueOnce(true);
  m.oldApp.mockResolvedValueOnce(true);
  render(await CustomerAccountPage());
  expect(screen.queryByRole("region", { name: "Thông báo trên điện thoại" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Bật thông báo trên máy này" })).not.toBeInTheDocument();
  expect(screen.getByText(/Chưa có thông báo nào/)).toBeInTheDocument();
});

it("D82: the 'Tải app' hint is hidden inside the Android app", async () => {
  render(await CustomerAccountPage());
  expect(screen.getByRole("link", { name: "Tải app Hiền Xa" })).toHaveAttribute("href", "/tai-app");
  cleanup();
  m.inApp.mockResolvedValueOnce(true);
  render(await CustomerAccountPage());
  expect(screen.queryByRole("link", { name: "Tải app Hiền Xa" })).not.toBeInTheDocument();
});
