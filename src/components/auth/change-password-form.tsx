"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { changeOwnPasswordAction } from "@/lib/auth/actions";

/** First sign-in with a temporary password (D14/C1): the new password replaces it, then the portal opens. */
export function ChangePasswordForm({ surface }: { surface: "customer" | "work" | "admin" }) {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, undefined);
  return (<>
    <form action={action} className="auth-form">
      <input type="hidden" name="surface" value={surface} />
      <div className="field"><label htmlFor="new-password">Mật khẩu mới</label><input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
      <div className="field"><label htmlFor="confirm-password">Nhập lại mật khẩu mới</label><input id="confirm-password" name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
      {state?.message && <p className="form-message" role="alert">{state.message}</p>}
      <button className="button button-primary auth-submit" type="submit" disabled={pending}><KeyRound size={19} />{pending ? "Đang lưu..." : "Đổi mật khẩu và tiếp tục"}</button>
    </form>
    <form action="/auth/logout" method="post" className="auth-note"><input type="hidden" name="surface" value={surface} /><button className="link-button" type="submit">Đăng xuất</button></form>
  </>);
}
