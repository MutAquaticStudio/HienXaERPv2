import { fireEvent, render, screen, within } from "@testing-library/react";
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
  // D75: five places; the green "Đặt" between them is a button that opens the sheet, not a link.
  expect([...menu.querySelectorAll("a, button")].map((item) => item.textContent)).toEqual(["Trang chủ", "Đơn hàng", "Đặt", "Công nợ", "Tôi"]);
  expect([...menu.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Trang chủ", "Đơn hàng", "Công nợ", "Tôi"]);
  customer.unmount();
});

it("opens 'Bạn muốn đặt gì?' from the green Đặt button with two equal choices, and closes it with Escape (D75)", () => {
  const { unmount } = render(<PortalShell audience="customer" canOrder canViewDebt>QA</PortalShell>);
  const trigger = screen.getAllByRole("button", { name: "Đặt" })[1];
  expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(trigger);
  const sheet = screen.getByRole("dialog", { name: "Bạn muốn đặt gì?" });
  const goods = within(sheet).getByRole("link", { name: /Hàng hóa/ });
  const service = within(sheet).getByRole("link", { name: /Dịch vụ/ });
  expect(goods).toHaveAttribute("href", "/customer/orders/new");
  expect(service).toHaveAttribute("href", "/customer/services/new");
  // Neither choice is pre-selected: they are the same kind of control with the same state.
  expect(goods.getAttribute("aria-current")).toBe(service.getAttribute("aria-current"));
  expect(goods.className).toBe(service.className);
  expect(goods).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  unmount();
});

it("shows no order button to accountants and receivers (D75, FB10)", () => {
  const { container, unmount } = render(<PortalShell audience="customer" canViewDebt>QA</PortalShell>);
  const menu = [...container.querySelectorAll("nav")].at(-1) as HTMLElement;
  expect([...menu.querySelectorAll("a, button")].map((item) => item.textContent)).toEqual(["Trang chủ", "Đơn hàng", "Công nợ", "Tôi"]);
  expect(screen.queryByRole("button", { name: "Đặt" })).not.toBeInTheDocument();
  unmount();
});

it("gives a lead worker a fifth place, Điều phối in the middle with the jobs waiting; ordinary workers keep four (D85)", () => {
  const { container, unmount } = render(<PortalShell audience="worker" dispatchCount={4}>QA</PortalShell>);
  const bottom = [...container.querySelectorAll("nav")].at(-1) as HTMLElement;
  expect([...bottom.querySelectorAll("a")].map((link) => link.querySelector("span")?.textContent)).toEqual(["Hôm nay", "Nhận việc", "Điều phối", "Thu nhập", "Tôi"]);
  const item = within(bottom).getByRole("link", { name: "Điều phối, 4 việc chờ người" });
  expect(item.getAttribute("href")).toBe("/work/dispatch");
  expect(item.textContent).toBe("Điều phối4");
  unmount();
  const none = render(<PortalShell audience="worker" dispatchCount={0}>QA</PortalShell>);
  const menu = [...none.container.querySelectorAll("nav")].at(-1) as HTMLElement;
  expect(within(menu).getByRole("link", { name: "Điều phối" }).textContent).toBe("Điều phối");
  none.unmount();
  const ordinary = render(<PortalShell audience="worker" dispatchCount={null}>QA</PortalShell>);
  expect(screen.queryByRole("link", { name: /Điều phối/ })).toBeNull();
  ordinary.unmount();
});
