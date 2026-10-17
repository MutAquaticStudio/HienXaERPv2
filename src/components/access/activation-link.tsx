"use client";

import { useActionState, useState } from "react";
import { createActivationLinkAction } from "@/lib/auth/actions";

/** One-time activation link shown to the manager, to pass on through Zalo or a text message. */
export function ActivationLinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return <div className="activation-link" role="group" aria-label="Link kích hoạt tài khoản">
    <label htmlFor="activation-link-value">Link kích hoạt</label>
    <input id="activation-link-value" readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
    <div className="form-actions">
      <button type="button" className="button button-primary" onClick={copy}>{copied ? "Đã sao chép" : "Sao chép link"}</button>
      {canShare && <button type="button" className="button button-secondary"
        onClick={() => { void navigator.share({ title: "Kích hoạt tài khoản Hiền Xa ERP", text: "Mở link để đặt mật khẩu tài khoản Hiền Xa ERP:", url: link }).catch(() => {}); }}>Gửi qua Zalo / tin nhắn</button>}
    </div>
    <small className="muted">Link chỉ dùng một lần và có thời hạn. Nhân viên mở link, đặt mật khẩu rồi đăng nhập bằng email. Hết hạn thì bấm &quot;Link kích hoạt&quot; ở dòng nhân viên để tạo link mới.</small>
  </div>;
}

/** "Link kích hoạt" on an employee row: a fresh link for someone who has not activated their account or lost access. */
export function ActivationLinkForm({ employeeId }: { employeeId: string }) {
  const [state, action, pending] = useActionState(createActivationLinkAction, undefined);
  return <form action={action} className="form-grid">
    <input type="hidden" name="employeeId" value={employeeId} />
    <p className="muted field-full">Tạo link để nhân viên tự đặt mật khẩu. Link cũ (nếu có) sẽ không dùng được nữa.</p>
    {state?.message && <p className={`form-message field-full${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    {state?.activationLink ? <div className="field-full"><ActivationLinkBox link={state.activationLink} /></div>
      : <div className="form-actions field-full"><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang tạo..." : "Tạo link kích hoạt"}</button></div>}
  </form>;
}
