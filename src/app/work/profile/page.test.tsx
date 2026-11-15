import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ inApp: vi.fn(async () => false), appearance: undefined as string | undefined }));
vi.mock("@/lib/app-shell/server", () => ({ openedInNativeApp: m.inApp }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "hx-appearance" && m.appearance ? { value: m.appearance } : undefined }) }));

vi.mock("@/components/notifications/push-toggle", () => ({ PushToggle: () => null }));
vi.mock("@/modules/portal/actions", () => ({
  getWorkerPortalSnapshot: async () => ({ employee: { display_name: "Trần Văn Tuấn", code: "NV01" } }),
}));
import WorkProfilePage from "./page";

afterEach(cleanup);

it("lets the worker sign out from Tôi (FB18)", async () => {
  render(await WorkProfilePage());
  const button = screen.getByRole("button", { name: "Đăng xuất" });
  const form = button.closest("form")!;
  expect(form).toHaveAttribute("action", "/auth/logout");
  expect(form.querySelector('input[name="surface"]')).toHaveAttribute("value", "work");
});

it("D84: Tôi has Giao diện with this device's saved choice", async () => {
  m.appearance = "dark.lg.be-vietnam";
  render(await WorkProfilePage());
  const section = screen.getByRole("region", { name: "Giao diện" });
  expect(within(section).getByLabelText("Tối")).toBeChecked();
  expect(within(section).getByLabelText("Lớn")).toBeChecked();
  m.appearance = undefined;
});

it("D82: inside the Android app neither the push card nor the 'Tải app' hint is shown", async () => {
  render(await WorkProfilePage());
  expect(screen.getByRole("heading", { name: "Báo việc mới về điện thoại" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Tải app Hiền Xa cho điện thoại" })).toHaveAttribute("href", "/tai-app");
  cleanup();
  m.inApp.mockResolvedValueOnce(true);
  render(await WorkProfilePage());
  expect(screen.queryByRole("heading", { name: "Báo việc mới về điện thoại" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Tải app Hiền Xa cho điện thoại" })).not.toBeInTheDocument();
});
