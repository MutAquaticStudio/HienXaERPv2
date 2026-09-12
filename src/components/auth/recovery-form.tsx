"use client";

import { useActionState } from "react";
import { recoveryAction } from "@/lib/auth/actions";

export function RecoveryForm({ surface }: { surface: "admin" | "work" | "customer" }) {
  const [state, action, pending] = useActionState(recoveryAction, undefined);
  return <form action={action} className="auth-form"><input type="hidden" name="surface" value={surface} /><div className="field"><label htmlFor="recovery-email">Email tài khoản</label><input id="recovery-email" name="email" type="email" autoComplete="email" required /></div>{state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}<button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? "Đang gửi..." : "Gửi hướng dẫn khôi phục"}</button></form>;
}
