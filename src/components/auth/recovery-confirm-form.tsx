"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type RecoveryStatus = "checking" | "invalid" | "ready" | "updated";

const loginPaths = { admin: "/login", work: "/work/login", customer: "/customer/login" } as const;

export function RecoveryConfirmForm({ surface, hasAuthError }: { surface: "admin" | "work" | "customer"; hasAuthError: boolean }) {
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabase> | null>(null);
  const [status, setStatus] = useState<RecoveryStatus>(hasAuthError ? "invalid" : "checking");
  const loginHref = loginPaths[surface];
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorInUrl = hasAuthError || params.has("error") || params.has("error_code") || hashParams.has("error") || hashParams.has("error_code");
    const supabase = errorInUrl ? null : createBrowserSupabase();
    if (supabase) {
      supabaseRef.current = supabase;
    }
    const { data: { subscription } } = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setStatus("ready");
    }) ?? { data: { subscription: null } };
    const timeout = window.setTimeout(() => setStatus((current) => current === "checking" ? "invalid" : current), errorInUrl ? 0 : 5000);
    return () => {
      window.clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, [hasAuthError]);

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8 || password.length > 200) {
      setMessage("Mật khẩu cần có từ 8 đến 200 ký tự.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Hai mật khẩu chưa khớp.");
      return;
    }
    const supabase = supabaseRef.current;
    if (!supabase || status !== "ready") {
      setStatus("invalid");
      return;
    }

    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) setMessage("Không thể cập nhật mật khẩu. Hãy yêu cầu liên kết khôi phục mới.");
      else setStatus("updated");
    } catch {
      setMessage("Không thể cập nhật mật khẩu lúc này. Hãy thử lại sau.");
    } finally {
      setPending(false);
    }
  }

  const heading = status === "checking" ? "Đang xác minh liên kết" : status === "invalid" ? "Liên kết không hợp lệ hoặc đã hết hạn" : status === "updated" ? "Đã cập nhật mật khẩu" : "Đặt mật khẩu mới";
  return <main className="auth-screen"><section className="auth-story"><span className="brand-mark">HX</span><p className="eyebrow">Khôi phục tài khoản</p><h1>Quay lại công việc an toàn.</h1><p>Liên kết khôi phục cần được xác minh trước khi đặt mật khẩu mới.</p></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">Xác minh tài khoản</p><h2>{heading}</h2>
    {status === "checking" && <p className="muted" role="status">Đang kiểm tra phiên khôi phục. Vui lòng chờ.</p>}
    {status === "invalid" && <><p className="form-message" role="alert">Không xác minh được liên kết. Liên kết có thể thiếu, sai hoặc đã hết hạn.</p><Link className="button button-secondary auth-submit" href="/recovery">Yêu cầu liên kết mới</Link></>}
    {status === "ready" && <form className="auth-form" onSubmit={submitPassword}><p className="muted">Tạo mật khẩu mới cho tài khoản của bạn.</p><div className="field"><label htmlFor="recovery-new-password">Mật khẩu mới</label><input id="recovery-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={password} onChange={(event) => setPassword(event.target.value)} /></div><div className="field"><label htmlFor="recovery-confirm-password">Nhập lại mật khẩu mới</label><input id="recovery-confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>{message && <p className="form-message" role="alert">{message}</p>}<button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? "Đang cập nhật..." : "Cập nhật mật khẩu"}</button></form>}
    {status === "updated" && <><p className="form-message success" role="status">Mật khẩu mới đã được lưu.</p><Link className="button button-secondary auth-submit" href={loginHref}>Tiếp tục đăng nhập</Link></>}
  </div></section></main>;
}
