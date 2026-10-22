import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ access: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/access/context", () => ({ resolveInternalAccess: m.access }));
vi.mock("@/lib/access/landing", () => ({ internalLandingPath: () => "/admin" }));
import { AppError } from "@/lib/core/errors";
import Home from "./page";

const params = (query: Record<string, string> = {}) => ({ searchParams: Promise.resolve(query), params: Promise.resolve({}) }) as unknown as PageProps<"/">;
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("lets someone signed out choose one of the three portals, with register for customers (FB7)", async () => {
  m.access.mockRejectedValue(new AppError({ code: "UNAUTHENTICATED", message: "Chưa đăng nhập", status: 401 }));
  render(await Home(params()));
  expect(screen.getByRole("heading", { name: "Bạn đăng nhập với vai trò nào?" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Khối vận hành/ })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: /Thợ & tài xế/ })).toHaveAttribute("href", "/work/login");
  const customer = screen.getByText("Khách hàng").closest(".portal-choice") as HTMLElement;
  expect(within(customer).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/customer/login");
  expect(within(customer).getByRole("link", { name: "Đăng ký" })).toHaveAttribute("href", "/customer/register");
});

it("sends someone already signed in on the operations side straight to work, and finishes a recovery link", async () => {
  m.access.mockResolvedValue({ permissions: new Set(), roleName: "Chủ" });
  await expect(Home(params())).rejects.toThrow("redirect:/admin");
  await expect(Home(params({ code: "abc" }))).rejects.toThrow("redirect:/recovery/confirm?surface=admin&code=abc");
});
