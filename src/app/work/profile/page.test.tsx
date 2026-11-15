import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ inApp: vi.fn(async () => false), history: vi.fn(async (): Promise<unknown[] | null> => []) }));
vi.mock("@/modules/announcements/server", () => ({ loadAnnouncementHistory: m.history }));
vi.mock("@/lib/app-shell/server", () => ({ openedInNativeApp: m.inApp }));

vi.mock("@/components/notifications/push-toggle", () => ({ PushToggle: () => null }));
vi.mock("@/modules/portal/actions", () => ({
  getWorkerPortalSnapshot: async () => ({ employee: { display_name: "Trần Văn Tuấn", code: "NV01" } }),
}));
import WorkProfilePage from "./page";

afterEach(cleanup);

it("D83: Tôi lists the pay-rate announcements to read again", async () => {
  m.history.mockResolvedValueOnce([{ id: "10000000-0000-4000-8000-000000000084", audience: "WORKER", kind: "PAY_RATE", label: null,
    title: "Đơn giá công mới", body: "Văn phòng đổi 1 đơn giá công lúc 09:40, 15/11/2026.", link: null, effective_at: null,
    created_at: "2026-11-15T02:40:00Z", updated_at: "2026-11-15T02:40:00Z", seen_at: "2026-11-15T03:00:00Z",
    lines: [{ code: "GACH", name: "Gạch đặc A1", unit: "Nghìn viên", old: "120000", old_kind: "VND", new: "130000", new_kind: "VND" }] }]);
  render(await WorkProfilePage());
  expect(m.history).toHaveBeenCalledWith("WORKER");
  expect(screen.getByRole("heading", { name: "Thông báo từ cửa hàng" })).toBeInTheDocument();
  expect(screen.getByText("mỗi Nghìn viên")).toBeInTheDocument();
  expect(screen.getByText("Tăng 10.000 ₫")).toBeInTheDocument();
  expect(screen.queryByText("Chưa xem")).not.toBeInTheDocument();
});

it("lets the worker sign out from Tôi (FB18)", async () => {
  render(await WorkProfilePage());
  const button = screen.getByRole("button", { name: "Đăng xuất" });
  const form = button.closest("form")!;
  expect(form).toHaveAttribute("action", "/auth/logout");
  expect(form.querySelector('input[name="surface"]')).toHaveAttribute("value", "work");
});

it("D82: the 'Tải app' hint is hidden inside the Android app", async () => {
  render(await WorkProfilePage());
  expect(screen.getByRole("link", { name: "Tải app Hiền Xa cho điện thoại" })).toHaveAttribute("href", "/tai-app");
  cleanup();
  m.inApp.mockResolvedValueOnce(true);
  render(await WorkProfilePage());
  expect(screen.queryByRole("link", { name: "Tải app Hiền Xa cho điện thoại" })).not.toBeInTheDocument();
});
