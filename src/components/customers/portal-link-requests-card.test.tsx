import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/modules/customers/portal-account-actions", () => ({ decidePortalLinkRequestAction: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/actions", () => ({ createCustomerPortalAccountAction: vi.fn(), resetCustomerPortalPasswordAction: vi.fn() }));
import { PortalLinkRequestsCard } from "./portal-link-requests-card";

afterEach(cleanup);
const request = { id: "7f780000-0000-4000-8000-000000000011", display_name: "Vang", phone: "0972964332", address_text: "Vang con bà Hiền, Khoang", email: "vang@example.test", created_at: "2026-11-14T12:41:00Z" };

it("shows what the person typed and the three answers of the office (D78)", () => {
  render(<PortalLinkRequestsCard customerId="c1" customerName="Vang 132" requests={[request]} />);
  expect(screen.getByRole("heading", { name: "Đăng ký cổng khách chờ duyệt (1)" })).toBeInTheDocument();
  expect(screen.getByText("vang@example.test")).toBeInTheDocument();
  expect(screen.getByText("Vang con bà Hiền, Khoang")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Gắn vào Vang 132" })).toHaveAttribute("value", "LINK");
  expect(screen.getByRole("button", { name: "Tạo khách mới" })).toHaveAttribute("value", "NEW_CUSTOMER");
  expect(screen.getByRole("button", { name: "Từ chối" })).toHaveAttribute("value", "REJECT");
  expect(screen.getByLabelText("Quyền khi gắn vào Vang 132")).toHaveValue("OWNER");
});

it("shows nothing when no registration waits", () => {
  const { container } = render(<PortalLinkRequestsCard customerId="c1" customerName="Vang 132" requests={[]} />);
  expect(container).toBeEmptyDOMElement();
});
