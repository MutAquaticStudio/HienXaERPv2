"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type RecoveryStatus = "checking" | "invalid" | "ready" | "updated";
type Flow = "recovery" | "invite";
/** What the email link brought: session tokens (invite / older recovery links), an error, or nothing (PKCE `?code=`). */
type EmailLink = { kind: "tokens"; accessToken: string; refreshToken: string; flow: Flow } | { kind: "error"; expired: boolean } | { kind: "none" };

const loginPaths = { admin: "/login", work: "/work/login", customer: "/customer/login" } as const;

/**
 * Staff invites from Supabase arrive as `#access_token=…&type=invite`. The browser client only accepts PKCE
 * `?code=` links, so tokens in the fragment are taken here, removed from the address bar, and turned into a session.
 */
function takeEmailLink(hasAuthError: boolean): EmailLink {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const errorCode = fragment.get("error_code") ?? query.get("error_code");
  if (hasAuthError || errorCode || fragment.has("error") || query.has("error")) return { kind: "error", expired: errorCode === "otp_expired" };
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (!accessToken || !refreshToken) return { kind: "none" };
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  return { kind: "tokens", accessToken, refreshToken, flow: fragment.get("type") === "invite" ? "invite" : "recovery" };
}

export function RecoveryConfirmForm({ surface, hasAuthError }: { surface: "admin" | "work" | "customer"; hasAuthError: boolean }) {
  const supabaseRef = useRef<ReturnType<typeof createBrowserSupabase> | null>(null);
  const emailLink = useRef<EmailLink | null>(null);
  const [status, setStatus] = useState<RecoveryStatus>(hasAuthError ? "invalid" : "checking");
  const [flow, setFlow] = useState<Flow>("recovery");
  const [expired, setExpired] = useState(false);
  const loginHref = loginPaths[surface];
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Read once: the fragment is cleared after the first read (and effects run twice in development).
    emailLink.current ??= takeEmailLink(hasAuthError);
    const link = emailLink.current;
    let active = true;
    if (link.kind === "error") {
      const timer = window.setTimeout(() => { setExpired(link.expired); setStatus("invalid"); }, 0);
      return () => window.clearTimeout(timer);
    }
    const supabase = createBrowserSupabase();
    supabaseRef.current = supabase;
    if (link.kind === "tokens") {
      supabase.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken }).then(
        ({ error }) => { if (active) { setFlow(link.flow); setStatus(error ? "invalid" : "ready"); } },
        () => { if (active) setStatus("invalid"); });
      return () => { active = false; };
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) setStatus("ready");
    });
    const timeout = window.setTimeout(() => setStatus((current) => current === "checking" ? "invalid" : current), 5000);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
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
      if (error) setMessage(flow === "invite" ? "Không thể đặt mật khẩu. Nhờ quản lý gửi lại lời mời." : "Không thể cập nhật mật khẩu. Hãy yêu cầu liên kết khôi phục mới.");
      else setStatus("updated");
    } catch {
      setMessage("Không thể cập nhật mật khẩu lúc này. Hãy thử lại sau.");
    } finally {
      setPending(false);
    }
  }

  const invite = flow === "invite";
  const heading = status === "checking" ? "Đang xác minh liên kết"
    : status === "invalid" ? (expired ? "Liên kết đã hết hạn hoặc đã được dùng" : "Liên kết không hợp lệ hoặc đã hết hạn")
    : status === "updated" ? (invite ? "Tài khoản đã sẵn sàng" : "Đã cập nhật mật khẩu")
    : invite ? "Đặt mật khẩu cho tài khoản mới" : "Đặt mật khẩu mới";
  return <main className="auth-screen"><section className="auth-story"><span className="brand-mark">HX</span>
    <p className="eyebrow">{invite ? "Kích hoạt tài khoản" : "Khôi phục tài khoản"}</p>
    <h1>{invite ? "Chào mừng đến Hiền Xa ERP." : "Quay lại công việc an toàn."}</h1>
    <p>{invite ? "Đặt mật khẩu một lần để bắt đầu làm việc theo vai trò quản lý đã cấp." : "Liên kết khôi phục cần được xác minh trước khi đặt mật khẩu mới."}</p></section>
    <section className="auth-panel"><div className="auth-card"><p className="eyebrow">Xác minh tài khoản</p><h2>{heading}</h2>
    {status === "checking" && <p className="muted" role="status">Đang kiểm tra liên kết. Vui lòng chờ.</p>}
    {status === "invalid" && <><p className="form-message" role="alert">{expired
      ? "Liên kết trong thư chỉ dùng được một lần và có hạn. Hãy yêu cầu liên kết mới bằng đúng email đã nhận thư, hoặc nhờ quản lý gửi lại lời mời."
      : "Không xác minh được liên kết. Liên kết có thể thiếu, sai hoặc đã hết hạn. Nếu đây là thư mời nhân viên, hãy nhờ quản lý gửi lại lời mời."}</p>
      <Link className="button button-secondary auth-submit" href="/recovery">Yêu cầu liên kết mới</Link></>}
    {status === "ready" && <form className="auth-form" onSubmit={submitPassword}><p className="muted">{invite ? "Tạo mật khẩu để đăng nhập những lần sau." : "Tạo mật khẩu mới cho tài khoản của bạn."}</p><div className="field"><label htmlFor="recovery-new-password">Mật khẩu mới</label><input id="recovery-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={password} onChange={(event) => setPassword(event.target.value)} /></div><div className="field"><label htmlFor="recovery-confirm-password">Nhập lại mật khẩu mới</label><input id="recovery-confirm-password" type="password" autoComplete="new-password" minLength={8} maxLength={200} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>{message && <p className="form-message" role="alert">{message}</p>}<button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? "Đang cập nhật..." : invite ? "Đặt mật khẩu" : "Cập nhật mật khẩu"}</button></form>}
    {status === "updated" && <><p className="form-message success" role="status">{invite ? "Mật khẩu đã được lưu. Bạn có thể bắt đầu làm việc." : "Mật khẩu mới đã được lưu."}</p>
      {invite ? <Link className="button button-primary auth-submit" href="/">Vào hệ thống</Link> : <Link className="button button-secondary auth-submit" href={loginHref}>Tiếp tục đăng nhập</Link>}</>}
  </div></section></main>;
}
