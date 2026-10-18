"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useActionState, useState } from "react";
import { loginAction } from "@/lib/auth/actions";

export function LoginForm({ surface }: { surface: "admin" | "work" | "customer" }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="surface" value={surface} />
      <div className="field"><label htmlFor={`${surface}-email`}>Email hoặc số điện thoại</label><input id={`${surface}-email`} name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></div>
      <div className="field"><label htmlFor={`${surface}-password`}>Mật khẩu</label><div className="password-field"><input id={`${surface}-password`} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" minLength={8} required /><button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></div>
      {state?.message && <p className="form-message" role="status">{state.message}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}><LogIn size={19} />{pending ? "Đang đăng nhập..." : "Đăng nhập"}</button>
      <a className="auth-link" href={`/recovery?surface=${surface}`}>Quên mật khẩu?</a>
      {surface === "customer" && <p className="auth-note">Chưa có tài khoản? <a className="auth-link" href="/customer/register">Đăng ký tài khoản</a></p>}
    </form>
  );
}
