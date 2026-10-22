import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ createCustomerPortalAccountAction: vi.fn(), resetCustomerPortalPasswordAction: vi.fn() }));
vi.mock("@/modules/customers/portal-account-actions", () => ({ revokeCustomerPortalAccessAction: vi.fn() }));
vi.mock("@/modules/purchasing/dispatch-actions", () => ({ recordPurchaseOrderSentAction: vi.fn() }));
import { PortalAccountsCard, temporaryPassword, type PortalAccount } from "./portal-accounts-card";

afterEach(cleanup);
const accounts: PortalAccount[] = [
  { membership_id: "m1", email: "0912345678@sdt.hienxavlxd.com", membership_role: "OWNER", active: true, granted_at: "2026-10-18T01:00:00Z", last_sign_in_at: null, must_change_password: true },
  { membership_id: "m2", email: "ketoan@example.test", membership_role: "FINANCE_CONTACT", active: false, granted_at: "2026-10-01T01:00:00Z", last_sign_in_at: "2026-10-02T02:00:00Z", must_change_password: false },
];

it("shows phone logins as the phone number and only offers commands on active logins", () => {
  render(<PortalAccountsCard customerId="c1" customerPhone="0912345678" accounts={accounts} canManage />);
  expect(screen.getByText("0912345678")).toBeInTheDocument();
  expect(screen.queryByText(/sdt\.hienxavlxd\.com/)).not.toBeInTheDocument();
  expect(screen.getByText(/Chưa đăng nhập lần nào · Chưa đổi mật khẩu tạm/)).toBeInTheDocument();
  expect(screen.getByText("Đã thu hồi")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Thu hồi" })).toHaveLength(1);
});

it("revokes with an optional note only (FB7)", () => {
  render(<PortalAccountsCard customerId="c1" customerPhone="0912345678" accounts={accounts} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "Thu hồi" }));
  expect(screen.getByLabelText("Ghi chú (không bắt buộc)")).not.toBeRequired();
  expect(screen.queryByLabelText(/Lý do/)).not.toBeInTheDocument();
});

it("opens the create form with the customer's phone and a temporary password", () => {
  render(<PortalAccountsCard customerId="c1" customerPhone="0912 345 678" accounts={[]} canManage />);
  fireEvent.click(screen.getByRole("button", { name: "+ Tạo tài khoản" }));
  expect(screen.getByLabelText("Email hoặc số điện thoại đăng nhập")).toHaveValue("0912345678");
  expect((screen.getByLabelText("Mật khẩu tạm") as HTMLInputElement).value).toHaveLength(10);
  expect(screen.getByLabelText("Quyền của tài khoản")).toHaveValue("OWNER");
});

it("reads only for people without customers.manage", () => {
  render(<PortalAccountsCard customerId="c1" customerPhone={null} accounts={accounts} canManage={false} />);
  expect(screen.queryByRole("button", { name: "+ Tạo tài khoản" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Đặt lại mật khẩu" })).not.toBeInTheDocument();
});

it("makes temporary passwords without look-alike characters", () => {
  for (let index = 0; index < 50; index += 1) expect(temporaryPassword()).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{10}$/);
});
