import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortalShell } from "./portal-shell";
vi.mock("@/components/messaging/chat-dock", () => ({ ChatDock: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/work" }));
describe("portal logout", () => {
  for (const audience of ["worker", "customer"] as const) {
    it(`submits POST for ${audience} shared-device logout`, () => {
      const { unmount } = render(<PortalShell audience={audience}>QA content</PortalShell>);
      const form = screen.getByRole("button", { name: /Đăng xuất/ }).closest("form");
      expect(form).toHaveAttribute("action", "/auth/logout");
      expect(form).toHaveAttribute("method", "post");
      // FB9: back to the sign-in page on this portal's tab.
      expect(form?.querySelector("input[name=surface]")).toHaveValue(audience === "worker" ? "work" : "customer");
      unmount();
    });
  }
});

it("tells assistive technology which menu item is the current page, in both the side and the bottom menu", () => {
  const { unmount } = render(<PortalShell audience="worker">QA content</PortalShell>);
  const current = screen.getAllByRole("link", { current: "page" });
  expect(current).toHaveLength(2);
  expect(current.every((link) => link.textContent === "Hôm nay")).toBe(true);
  unmount();
});

it("keeps four places in the worker's phone menu and raises Đặt hàng for customers who order (FB18)", () => {
  const { container, unmount } = render(<PortalShell audience="worker">QA</PortalShell>);
  const bottom = [...container.querySelectorAll("nav")].at(-1) as HTMLElement;
  expect([...bottom.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Hôm nay", "Nhận việc", "Thu nhập", "Tôi"]);
  expect(screen.getAllByRole("link", { name: "Tin nhắn" }).every((link) => link.getAttribute("href") === "/work/messages")).toBe(true);
  unmount();
  const customer = render(<PortalShell audience="customer" canOrder canViewDebt>QA</PortalShell>);
  const menu = [...customer.container.querySelectorAll("nav")].at(-1) as HTMLElement;
  expect([...menu.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Trang chủ", "Đơn hàng", "Đặt hàng", "Công nợ", "Tôi"]);
  customer.unmount();
});
