import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@/modules/portal/server", () => ({ authenticatedPortalClient: m.client, portalRpc: m.rpc }));
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
  m.client.mockResolvedValue({ supabase: {}, user: { email: "0900000000@sdt.hienxavlxd.com", last_sign_in_at: "2026-10-22T01:00:00Z" } });
  m.rpc.mockResolvedValue(account);
});
afterEach(cleanup);

it("shows how the customer signs in, their details and delivery addresses (FB7)", async () => {
  render(await CustomerAccountPage());
  expect(m.rpc).toHaveBeenCalledWith({}, "customer_portal_account", { target_customer_id: null });
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
