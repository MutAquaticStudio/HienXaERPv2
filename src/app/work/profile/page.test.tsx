import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/notifications/push-toggle", () => ({ PushToggle: () => null }));
vi.mock("@/modules/portal/actions", () => ({
  getWorkerPortalSnapshot: async () => ({ employee: { display_name: "Trần Văn Tuấn", code: "NV01" } }),
}));
import WorkProfilePage from "./page";

it("lets the worker sign out from Tôi (FB18)", async () => {
  render(await WorkProfilePage());
  const button = screen.getByRole("button", { name: "Đăng xuất" });
  const form = button.closest("form")!;
  expect(form).toHaveAttribute("action", "/auth/logout");
  expect(form.querySelector('input[name="surface"]')).toHaveAttribute("value", "work");
});
