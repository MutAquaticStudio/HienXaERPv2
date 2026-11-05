import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserSupabase: m.create }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace }) }));
import { SignupConfirm } from "./signup-confirm";

beforeEach(() => {
  vi.clearAllMocks();
  m.create.mockReturnValue({ auth: { verifyOtp: m.verifyOtp, signOut: m.signOut } });
  m.verifyOtp.mockResolvedValue({ data: {}, error: null });
  m.signOut.mockResolvedValue({ error: null });
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

it("D67: confirms the email in the browser, takes the token off the address bar, signs the session out and opens the customer sign-in", async () => {
  window.history.replaceState(null, "", "/auth/confirm?token_hash=abc123&type=signup");
  render(<SignupConfirm />);
  expect(window.location.search).toBe("");
  expect(screen.getByRole("heading", { name: "Đang xác nhận email" })).toBeInTheDocument();
  await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/customer/login?confirmed=1"));
  expect(m.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc123", type: "signup" });
  expect(m.signOut).toHaveBeenCalledWith({ scope: "local" });
});

it("D67: an expired or used link says so in Vietnamese and offers sign-in; a missing token does too, without calling Supabase", async () => {
  window.history.replaceState(null, "", "/auth/confirm?token_hash=old&type=signup");
  m.verifyOtp.mockResolvedValue({ data: {}, error: { message: "Email link is invalid or has expired" } });
  render(<SignupConfirm />);
  expect(await screen.findByRole("heading", { name: "Liên kết đã hết hạn hoặc đã được dùng" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Đăng nhập" })).toHaveAttribute("href", "/customer/login");
  expect(m.replace).not.toHaveBeenCalled();
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/auth/confirm");
  render(<SignupConfirm />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Không xác nhận được email");
  expect(m.verifyOtp).not.toHaveBeenCalled();
});
