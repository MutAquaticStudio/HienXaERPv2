import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PortalShell } from "./portal-shell";
vi.mock("next/navigation", () => ({ usePathname: () => "/work" }));
describe("portal logout", () => {
  for (const audience of ["worker", "customer"] as const) {
    it(`submits POST for ${audience} shared-device logout`, () => {
      const { unmount } = render(<PortalShell audience={audience}>QA content</PortalShell>);
      const form = screen.getByRole("button", { name: /Đăng xuất/ }).closest("form");
      expect(form).toHaveAttribute("action", "/auth/logout");
      expect(form).toHaveAttribute("method", "post");
      unmount();
    });
  }
});

it("tells assistive technology which menu item is the current page, in both the side and the bottom menu", () => {
  const { unmount } = render(<PortalShell audience="worker">QA content</PortalShell>);
  const current = screen.getAllByRole("link", { current: "page" });
  expect(current).toHaveLength(2);
  expect(current.every((link) => link.textContent === "Công việc")).toBe(true);
  unmount();
});
