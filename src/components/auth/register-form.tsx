"use client";

import { UserPlus } from "lucide-react";
import { useActionState } from "react";
import { registerCustomerAccountAction } from "@/lib/auth/actions";

/**
 * D14 "Đăng ký tài khoản" on the customer portal: who the customer is and where to deliver, then the login. The business is
 * told and checks the new customer; prices are the general price list until it assigns a price group.
 */
export function RegisterForm() {
  const [state, action, pending] = useActionState(registerCustomerAccountAction, undefined);
  if (state?.success) return <div className="auth-form"><p className="form-message" role="status">{state.message}</p><a className="button button-primary auth-submit" href="/customer/login">Đi tới đăng nhập</a></div>;
  return (
    <form action={action} className="auth-form">
      <div className="field"><label htmlFor="register-name">Họ tên hoặc tên cửa hàng</label><input id="register-name" name="name" autoComplete="name" minLength={2} maxLength={160} required /></div>
      <div className="field"><label htmlFor="register-phone">Số điện thoại</label><input id="register-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} required /></div>
      <div className="field"><label htmlFor="register-address">Địa chỉ giao hàng</label><textarea id="register-address" name="address" autoComplete="street-address" minLength={5} maxLength={300} required /></div>
      <div className="field"><label htmlFor="register-email">Email</label><input id="register-email" name="email" type="email" inputMode="email" autoComplete="email" maxLength={200} required /></div>
      <div className="field"><label htmlFor="register-password">Mật khẩu</label><input id="register-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
      <div className="field"><label htmlFor="register-confirm">Nhập lại mật khẩu</label><input id="register-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
      {state?.message && <p className="form-message" role="alert">{state.message}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}><UserPlus size={19} />{pending ? "Đang đăng ký..." : "Đăng ký"}</button>
      <p className="auth-note">Không có email? Gọi cửa hàng để được tạo tài khoản đăng nhập bằng số điện thoại.</p>
      <a className="auth-link" href="/customer/login">Đã có tài khoản? Đăng nhập</a>
    </form>
  );
}
