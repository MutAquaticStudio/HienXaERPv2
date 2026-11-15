import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ inApp: vi.fn(async () => false), access: vi.fn(), portals: vi.fn(), user: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/access/context", () => ({ resolveInternalAccess: m.access }));
vi.mock("@/lib/access/landing", () => ({ internalLandingPath: () => "/admin" }));
vi.mock("@/lib/auth/actions", () => ({ loginAction: vi.fn() }));
vi.mock("@/lib/company/sign-in-logo", () => ({ loadSignInLogoUrl: async () => null }));
vi.mock("@/lib/auth/account-portals", () => ({ accountPortals: m.portals }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => ({ auth: { getUser: m.user } }) }));
vi.mock("@/lib/app-shell/server", () => ({ openedInNativeApp: m.inApp }));
import { AppError } from "@/lib/core/errors";
import Home from "./page";

const params = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query), params: Promise.resolve({}) }) as unknown as PageProps<"/">;
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("opens signed-out visitors straight on the sign-in card, a tab per portal and no promotional panel (D30)", async () => {
  m.access.mockRejectedValue(new AppError({ code: "UNAUTHENTICATED", message: "Chưa đăng nhập", status: 401 }));
  render(await Home(params()));
  expect(screen.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeInTheDocument();
  const tabs = within(screen.getByRole("tablist", { name: "Cổng đăng nhập" })).getAllByRole("tab");
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Vận hành", "Thợ & tài xế", "Khách hàng"]);
  expect(screen.getByRole("tab", { name: "Vận hành" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Đăng nhập" })).toBeInTheDocument();
  expect(screen.queryByText(/Một nguồn dữ liệu/)).not.toBeInTheDocument();
});

it("sends someone already signed in on the operations side straight to work, and finishes a recovery link", async () => {
  m.access.mockResolvedValue({ permissions: new Set(), roleName: "Chủ" });
  await expect(Home(params())).rejects.toThrow("redirect:/admin");
  await expect(Home(params({ code: "abc" }))).rejects.toThrow("redirect:/recovery/confirm?surface=admin&code=abc");
});

it("FB9: after signing out of a portal, opens on that portal's tab", async () => {
  m.access.mockRejectedValue(new AppError({ code: "UNAUTHENTICATED", message: "Chưa đăng nhập", status: 401 }));
  render(await Home(params({ portal: "work" })));
  expect(screen.getByRole("tab", { name: "Thợ & tài xế" })).toHaveAttribute("aria-selected", "true");
});

it("D81: a customer still signed in (the app reopened) goes straight to the customer portal", async () => {
  m.access.mockRejectedValue(new AppError({ code: "FORBIDDEN", message: "Không phải nhân viên", status: 403 }));
  m.user.mockResolvedValue({ data: { user: { id: "u1" } } });
  m.portals.mockResolvedValue({ admin: false, work: false, customer: true });
  await expect(Home(params())).rejects.toThrow("redirect:/customer");
  m.portals.mockResolvedValue({ admin: false, work: false, customer: false });
  render(await Home(params()));
  expect(screen.getByRole("heading", { level: 1, name: "Đăng nhập" })).toBeInTheDocument();
});

it("D82: points to /tai-app, except inside the Android app", async () => {
  m.access.mockRejectedValue(new AppError({ code: "UNAUTHENTICATED", message: "Chưa đăng nhập", status: 401 }));
  render(await Home(params()));
  expect(screen.getByRole("link", { name: "Tải app Hiền Xa cho điện thoại" })).toHaveAttribute("href", "/tai-app");
  cleanup();
  m.inApp.mockResolvedValueOnce(true);
  render(await Home(params()));
  expect(screen.queryByRole("link", { name: "Tải app Hiền Xa cho điện thoại" })).not.toBeInTheDocument();
});
