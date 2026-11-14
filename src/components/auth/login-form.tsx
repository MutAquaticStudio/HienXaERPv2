"use client";

import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from "lucide-react";
import { useActionState, useState, useSyncExternalStore, type FormEvent } from "react";
import { loginAction } from "@/lib/auth/actions";

type Surface = "admin" | "work" | "customer";

/** D77: the account name this device remembers for a portal, and whether the person turned "Ghi nhớ" off last time. */
export const rememberedLoginKey = (surface: Surface) => `hx.login.${surface}`;
export const REMEMBER_CHOICE_KEY = "hx.login.remember";

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
  } catch { /* private mode: nothing is remembered */ }
}
const subscribe = (changed: () => void) => {
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
};

/** Keeps (or forgets) the account name typed on this device, as the "Ghi nhớ đăng nhập" box says. */
export function rememberLogin(surface: Surface, login: string, remember: boolean) {
  write(REMEMBER_CHOICE_KEY, remember ? null : "0");
  write(rememberedLoginKey(surface), remember && login.trim() ? login.trim() : null);
}

export function LoginForm({ surface }: { surface: Surface }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const savedLogin = useSyncExternalStore(subscribe, () => read(rememberedLoginKey(surface)) ?? "", () => "");
  // Off when the person turned it off here before, or when a sign-out of a shared device just wiped that memory (D77).
  const rememberOff = useSyncExternalStore(subscribe, () => read(REMEMBER_CHOICE_KEY) === "0" || new URLSearchParams(window.location.search).get("remember") === "off", () => false);

  function keep(event: FormEvent<HTMLFormElement>) {
    const data = new FormData(event.currentTarget);
    rememberLogin(surface, String(data.get("email") ?? ""), data.get("remember") === "on");
  }

  return (
    <form action={action} onSubmit={keep} className="auth-form">
      <input type="hidden" name="surface" value={surface} />
      <div className="field"><label htmlFor={`${surface}-email`}>Email hoặc số điện thoại</label><div className="input-with-icon"><UserRound size={18} aria-hidden="true" /><input key={savedLogin} id={`${surface}-email`} name="email" type="text" defaultValue={savedLogin} autoComplete="username" autoCapitalize="none" spellCheck={false} required /></div></div>
      <div className="field"><label htmlFor={`${surface}-password`}>Mật khẩu</label><div className="password-field input-with-icon"><LockKeyhole size={18} aria-hidden="true" /><input id={`${surface}-password`} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={8} required /><button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></div>
      <div className="auth-remember">
        <label className="check-inline auth-remember-check"><input key={rememberOff ? "off" : "on"} type="checkbox" name="remember" defaultChecked={!rememberOff} aria-describedby={`${surface}-remember-hint`} /> Ghi nhớ đăng nhập trên thiết bị này</label>
        <p className="field-hint" id={`${surface}-remember-hint`}>Dùng máy chung thì bỏ chọn: đóng trình duyệt là tự đăng xuất. Đăng nhập ở máy này không làm thoát các thiết bị khác.</p>
      </div>
      {state?.message && <p className="form-message" role="status">{state.message}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}><LogIn size={19} />{pending ? "Đang đăng nhập..." : "Đăng nhập"}</button>
      <a className="auth-link" href={`/recovery?surface=${surface}`}>Quên mật khẩu?</a>
      {surface === "customer" && <p className="auth-note">Chưa có tài khoản? <a className="auth-link" href="/customer/register">Đăng ký tài khoản</a></p>}
    </form>
  );
}
