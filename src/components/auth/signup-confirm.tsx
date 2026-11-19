"use client";

// D67: the sign-up confirmation email points to the shop's own address: /auth/confirm?token_hash=…&type=signup.
// The one-time token is used here, in the browser (a chat app that previews the link does not run scripts, so it cannot use
// the token up), then the person goes to the normal customer sign-in, which creates the customer profile as before.
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AuthFrame } from "./auth-frame";

type Status = "checking" | "invalid";

type Link = { tokenHash: string; type: "signup" | "email" };

function takeToken(): Link | null {
  const query = new URLSearchParams(window.location.search);
  const tokenHash = query.get("token_hash");
  const type = query.get("type");
  if (!tokenHash || (type !== "signup" && type !== "email")) return null;
  query.delete("token_hash");
  query.delete("type");
  const rest = query.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  return { tokenHash, type };
}

export function SignupConfirm() {
  const router = useRouter();
  const token = useRef<Link | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    // Read once: the token is removed from the address bar on the first read (and effects run twice in development).
    if (token.current === undefined) token.current = takeToken();
    const link = token.current;
    let active = true;
    if (!link) {
      const timer = window.setTimeout(() => setStatus("invalid"), 0);
      return () => window.clearTimeout(timer);
    }
    const supabase = createBrowserSupabase();
    (async () => {
      const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
      if (!active) return;
      if (error) { setStatus("invalid"); return; }
      // Only the email is confirmed here; signing in (and the customer profile) is the normal sign-in screen's job.
      await supabase.auth.signOut({ scope: "local" }).catch(() => null);
      router.replace("/customer/login?confirmed=1");
    })().catch(() => { if (active) setStatus("invalid"); });
    return () => { active = false; };
  }, [router]);

  return <AuthFrame tagline="Khách hàng">
    {status === "checking"
      ? <><h1>Đang xác nhận email</h1><p className="muted" role="status">Đang kiểm tra liên kết. Vui lòng chờ.</p></>
      : <><h1>Liên kết đã hết hạn hoặc đã được dùng</h1>
        <p className="form-message" role="alert">Không xác nhận được email. Liên kết chỉ dùng được một lần và có hạn. Nếu bạn đã bấm trước đó, email đã được xác nhận: hãy đăng nhập. Nếu chưa, đăng ký lại bằng đúng email này để nhận liên kết mới.</p>
        <NextLink className="button button-primary auth-submit" href="/customer/login">Đăng nhập</NextLink></>}
  </AuthFrame>;
}
