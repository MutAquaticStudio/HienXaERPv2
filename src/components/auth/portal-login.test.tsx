import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/actions", () => ({ loginAction: vi.fn() }));
import { LAST_PORTAL_KEY, PortalLogin } from "./portal-login";

const surface = () => (document.querySelector('input[name="surface"]') as HTMLInputElement).value;
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("opens a portal's own login page on its tab and switches portal from the tabs (D30)", () => {
  localStorage.setItem(LAST_PORTAL_KEY, "customer");
  render(<PortalLogin initial="work" />);
  expect(screen.getByRole("tab", { name: "Thợ & tài xế" })).toHaveAttribute("aria-selected", "true");
  expect(surface()).toBe("work");
  fireEvent.click(screen.getByRole("tab", { name: "Khách hàng" }));
  expect(surface()).toBe("customer");
  expect(screen.getByRole("link", { name: "Đăng ký tài khoản" })).toHaveAttribute("href", "/customer/register");
  expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "portal-tab-customer");
});

it("starts the home page on the portal this device used last, and remembers the portal signed in to", () => {
  localStorage.setItem(LAST_PORTAL_KEY, "work");
  render(<PortalLogin initial="admin" remember />);
  expect(screen.getByRole("tab", { name: "Thợ & tài xế" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("tab", { name: "Vận hành" }));
  fireEvent.submit(screen.getByRole("button", { name: "Đăng nhập" }).closest("form")!);
  expect(localStorage.getItem(LAST_PORTAL_KEY)).toBe("admin");
});

it("ignores an unknown remembered value and moves between tabs with the arrow keys", () => {
  localStorage.setItem(LAST_PORTAL_KEY, "somewhere");
  render(<PortalLogin initial="admin" remember />);
  const first = screen.getByRole("tab", { name: "Vận hành" });
  expect(first).toHaveAttribute("aria-selected", "true");
  expect(first).toHaveAttribute("tabindex", "0");
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowLeft" });
  const last = screen.getByRole("tab", { name: "Khách hàng" });
  expect(last).toHaveAttribute("aria-selected", "true");
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Home" });
  expect(screen.getByRole("tab", { name: "Vận hành" })).toHaveFocus();
});
