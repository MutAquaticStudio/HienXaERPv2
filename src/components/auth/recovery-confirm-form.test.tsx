import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ create: vi.fn(), setSession: vi.fn(), updateUser: vi.fn(), onAuthStateChange: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createBrowserSupabase: m.create }));

import { EMAIL_LINK_HANDOFF_SCRIPT } from "./email-link-handoff";
import { RecoveryConfirmForm } from "./recovery-confirm-form";

let authListener: ((event: string, session: unknown) => void) | null = null;
beforeEach(() => {
  vi.clearAllMocks();
  authListener = null;
  m.create.mockReturnValue({ auth: { setSession: m.setSession, updateUser: m.updateUser, onAuthStateChange: m.onAuthStateChange } });
  m.setSession.mockResolvedValue({ data: {}, error: null });
  m.updateUser.mockResolvedValue({ data: {}, error: null });
  m.onAuthStateChange.mockImplementation((listener) => { authListener = listener; return { data: { subscription: { unsubscribe: m.unsubscribe } } }; });
});
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

function setPassword(value: string) {
  fireEvent.change(screen.getByLabelText("Mật khẩu mới"), { target: { value } });
  fireEvent.change(screen.getByLabelText("Nhập lại mật khẩu mới"), { target: { value } });
}

it("turns a staff invite link into a session, clears the tokens from the address bar and sets the password", async () => {
  window.history.replaceState(null, "", "/recovery/confirm?surface=admin#access_token=at-1&refresh_token=rt-1&expires_in=3600&token_type=bearer&type=invite");
  render(<RecoveryConfirmForm surface="admin" hasAuthError={false} />);
  expect(window.location.hash).toBe("");
  expect(window.location.search).toBe("?surface=admin");
  expect(await screen.findByRole("heading", { name: "Đặt mật khẩu cho tài khoản mới" })).toBeInTheDocument();
  expect(m.setSession).toHaveBeenCalledWith({ access_token: "at-1", refresh_token: "rt-1" });

  setPassword("mat-khau-moi");
  fireEvent.click(screen.getByRole("button", { name: "Đặt mật khẩu" }));
  expect(await screen.findByRole("heading", { name: "Tài khoản đã sẵn sàng" })).toBeInTheDocument();
  expect(m.updateUser).toHaveBeenCalledWith({ password: "mat-khau-moi" });
  expect(screen.getByRole("link", { name: "Vào hệ thống" })).toHaveAttribute("href", "/");
});

it("rejects invite tokens Supabase no longer accepts", async () => {
  m.setSession.mockResolvedValue({ data: {}, error: { message: "invalid" } });
  window.history.replaceState(null, "", "/recovery/confirm#access_token=old&refresh_token=old&type=invite");
  render(<RecoveryConfirmForm surface="admin" hasAuthError={false} />);
  expect(await screen.findByRole("heading", { name: "Liên kết không hợp lệ hoặc đã hết hạn" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Mật khẩu mới")).not.toBeInTheDocument();
});

it("explains an expired or already used link without contacting Supabase", async () => {
  window.history.replaceState(null, "", "/recovery/confirm#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  render(<RecoveryConfirmForm surface="admin" hasAuthError={false} />);
  expect(await screen.findByRole("heading", { name: "Liên kết đã hết hạn hoặc đã được dùng" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("gửi lại lời mời");
  expect(m.create).not.toHaveBeenCalled();
});

it("keeps the PKCE recovery flow for password reset emails", async () => {
  window.history.replaceState(null, "", "/recovery/confirm?surface=work&code=abc");
  render(<RecoveryConfirmForm surface="work" hasAuthError={false} />);
  expect(screen.getByRole("heading", { name: "Đang xác minh liên kết" })).toBeInTheDocument();
  expect(m.setSession).not.toHaveBeenCalled();
  act(() => authListener?.("PASSWORD_RECOVERY", { user: {} }));
  setPassword("mat-khau-moi");
  fireEvent.click(screen.getByRole("button", { name: "Cập nhật mật khẩu" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "Tiếp tục đăng nhập" })).toHaveAttribute("href", "/work/login"));
});

function handoff(pathname: string, hash: string) {
  const replace = vi.fn();
  new Function("location", EMAIL_LINK_HANDOFF_SCRIPT)({ pathname, hash, replace });
  return replace.mock.calls[0]?.[0] ?? null;
}

it("sends an invite fragment that landed on another page to the password page", () => {
  expect(handoff("/", "#access_token=a&refresh_token=b&type=invite")).toBe("/recovery/confirm?surface=admin#access_token=a&refresh_token=b&type=invite");
  expect(handoff("/work/login", "#error=access_denied&error_code=otp_expired")).toBe("/recovery/confirm?surface=work#error=access_denied&error_code=otp_expired");
  expect(handoff("/customer/login", "#access_token=a&refresh_token=b")).toBe("/recovery/confirm?surface=customer#access_token=a&refresh_token=b");
  expect(handoff("/recovery/confirm", "#access_token=a&refresh_token=b")).toBeNull();
  expect(handoff("/login", "")).toBeNull();
  expect(handoff("/admin/orders", "#section")).toBeNull();
});
