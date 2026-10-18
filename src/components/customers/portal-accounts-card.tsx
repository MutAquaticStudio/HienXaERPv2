"use client";

import { useActionState, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { zaloLink } from "@/components/purchasing/send-to-supplier";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createCustomerPortalAccountAction, resetCustomerPortalPasswordAction, type PortalAccountState } from "@/lib/auth/actions";
import { displayLogin, normalizePhone } from "@/lib/auth/login-identifier";
import { revokeCustomerPortalAccessAction } from "@/modules/customers/portal-account-actions";

export type PortalAccount = { membership_id: string; email: string; membership_role: "OWNER" | "FINANCE_CONTACT" | "RECEIVER"; active: boolean;
  granted_at: string; last_sign_in_at: string | null; must_change_password: boolean };

export const portalRoleLabel: Record<PortalAccount["membership_role"], string> = {
  OWNER: "Chủ tài khoản — đặt hàng, xem đơn và công nợ",
  FINANCE_CONTACT: "Kế toán — xem đơn và công nợ",
  RECEIVER: "Người nhận hàng — chỉ xem giao nhận",
};

/** A temporary password the owner reads out or sends; no look-alike characters (0/O, 1/l/I). */
export function temporaryPassword(length = 10) {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

type Open = { kind: "create" } | { kind: "reset"; account: PortalAccount } | { kind: "revoke"; account: PortalAccount } | null;

/**
 * Khách hàng 360 · "Tài khoản cổng khách" (D14/C1): the customer's logins, and for customers.manage a login with an email or a
 * phone number and a temporary password (changed at the first sign-in), a new temporary password, or revoking a login.
 */
export function PortalAccountsCard({ customerId, customerPhone, accounts, canManage }: {
  customerId: string; customerPhone: string | null; accounts: PortalAccount[]; canManage: boolean;
}) {
  const [open, setOpen] = useState<Open>(null);
  const active = accounts.filter((account) => account.active);
  return <section className="card card-pad portal-accounts">
    <div className="section-head"><h2>Tài khoản cổng khách</h2>
      {canManage && <button type="button" className="button button-secondary" onClick={() => setOpen({ kind: "create" })}>+ Tạo tài khoản</button>}</div>
    {accounts.length ? <ul className="portal-account-list">{accounts.map((account) => <li key={account.membership_id} className={account.active ? undefined : "row-muted"}>
      <div><strong>{displayLogin(account.email)}</strong>
        <small className="table-subline">{portalRoleLabel[account.membership_role]}</small>
        <small className="table-subline">{!account.active ? "Đã thu hồi" : account.last_sign_in_at ? `Đăng nhập gần nhất ${formatBusinessDateTime(account.last_sign_in_at)}` : "Chưa đăng nhập lần nào"}
          {account.active && account.must_change_password ? " · Chưa đổi mật khẩu tạm" : ""}</small></div>
      {canManage && account.active && <div className="inline-actions">
        <button type="button" className="link-button" onClick={() => setOpen({ kind: "reset", account })}>Đặt lại mật khẩu</button>
        <button type="button" className="link-button text-danger" onClick={() => setOpen({ kind: "revoke", account })}>Thu hồi</button>
      </div>}
    </li>)}</ul> : <p className="empty-inline">Khách chưa có tài khoản đăng nhập cổng khách{canManage ? ". Bấm “+ Tạo tài khoản” để khách tự đặt hàng và theo dõi đơn." : "."}</p>}
    {!active.length && accounts.length > 0 && <p className="muted">Mọi tài khoản của khách đã bị thu hồi.</p>}
    {open?.kind === "create" && <CreateDialog customerId={customerId} customerPhone={customerPhone} onClose={() => setOpen(null)} />}
    {open?.kind === "reset" && <ResetDialog customerId={customerId} customerPhone={customerPhone} account={open.account} onClose={() => setOpen(null)} />}
    {open?.kind === "revoke" && <RevokeDialog customerId={customerId} account={open.account} onClose={() => setOpen(null)} />}
  </section>;
}

function ShareResult({ state, customerPhone }: { state: NonNullable<PortalAccountState>; customerPhone: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const zalo = zaloLink(customerPhone);
  return <div className="portal-share">
    <p className="form-message" role="status">{state.message}</p>
    {state.shareText && <>
      <pre className="send-supplier-text">{state.shareText}</pre>
      <div className="inline-actions">
        <button type="button" className="button button-primary" onClick={() => { void navigator.clipboard?.writeText(state.shareText!).then(() => setCopied("Đã chép. Dán vào khung chat Zalo của khách."))
          .catch(() => setCopied("Không chép được; chọn và chép nội dung ở trên.")); }}>Chép nội dung</button>
        {zalo && <a className="button button-secondary" href={zalo} target="_blank" rel="noopener noreferrer">Mở Zalo khách</a>}
      </div>
      {copied && <p className="muted" role="status">{copied}</p>}
    </>}
  </div>;
}

function PasswordField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return <div className="field"><label htmlFor={id}>Mật khẩu tạm</label>
    <div className="inline-actions"><input id={id} name="password" value={value} onChange={(event) => onChange(event.target.value)} minLength={8} maxLength={72} required autoComplete="off" />
      <button type="button" className="link-button" onClick={() => onChange(temporaryPassword())}>Tạo mật khẩu khác</button></div>
    <small className="muted">Khách đổi mật khẩu này ở lần đăng nhập đầu tiên.</small></div>;
}

function CreateDialog({ customerId, customerPhone, onClose }: { customerId: string; customerPhone: string | null; onClose: () => void }) {
  const [state, action, pending] = useActionState(createCustomerPortalAccountAction, undefined);
  const [password, setPassword] = useState(() => temporaryPassword());
  return <Dialog title="Tạo tài khoản cổng khách" description="Khách đăng nhập bằng email hoặc số điện thoại. Không cần gửi email — gửi thông tin qua Zalo."
    onClose={onClose} initialFocusId="portal-login">
    {state?.success ? <ShareResult state={state} customerPhone={customerPhone} /> : <form action={action} className="form-stack">
      <input type="hidden" name="customerId" value={customerId} />
      <div className="field"><label htmlFor="portal-login">Email hoặc số điện thoại đăng nhập</label>
        <input id="portal-login" name="login" defaultValue={normalizePhone(customerPhone ?? "") ?? ""} required maxLength={200} autoComplete="off" /></div>
      <PasswordField id="portal-password" value={password} onChange={setPassword} />
      <div className="field"><label htmlFor="portal-role">Quyền của tài khoản</label>
        <select id="portal-role" name="role" defaultValue="OWNER">{Object.entries(portalRoleLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {state?.message && <p className="form-message" role="alert">{state.message}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>
        <button type="submit" className="button button-primary" disabled={pending}>{pending ? "Đang tạo..." : "Tạo tài khoản"}</button></div>
    </form>}
  </Dialog>;
}

function ResetDialog({ customerId, customerPhone, account, onClose }: { customerId: string; customerPhone: string | null; account: PortalAccount; onClose: () => void }) {
  const [state, action, pending] = useActionState(resetCustomerPortalPasswordAction, undefined);
  const [password, setPassword] = useState(() => temporaryPassword());
  return <Dialog title="Đặt lại mật khẩu" eyebrow={displayLogin(account.email)} description="Mật khẩu cũ hết hiệu lực ngay; khách đổi mật khẩu tạm ở lần đăng nhập kế tiếp."
    onClose={onClose} initialFocusId="portal-reset-password">
    {state?.success ? <ShareResult state={state} customerPhone={customerPhone} /> : <form action={action} className="form-stack">
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="membershipId" value={account.membership_id} />
      <PasswordField id="portal-reset-password" value={password} onChange={setPassword} />
      {state?.message && <p className="form-message" role="alert">{state.message}</p>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>
        <button type="submit" className="button button-primary" disabled={pending}>{pending ? "Đang lưu..." : "Đặt mật khẩu tạm"}</button></div>
    </form>}
  </Dialog>;
}

function RevokeDialog({ customerId, account, onClose }: { customerId: string; account: PortalAccount; onClose: () => void }) {
  const [state, action, pending] = useActionState(revokeCustomerPortalAccessAction, undefined);
  return <Dialog title="Thu hồi tài khoản" eyebrow={displayLogin(account.email)} description="Tài khoản không vào được cổng khách của khách hàng này nữa; lịch sử vẫn giữ."
    onClose={onClose} initialFocusId="portal-revoke-reason">
    {state?.success ? <><p className="form-message" role="status">{state.message}</p>
      <div className="form-actions"><button type="button" className="button button-primary" onClick={onClose}>Xong</button></div></>
      : <form action={action} className="form-stack">
        <input type="hidden" name="customerId" value={customerId} />
        <input type="hidden" name="membershipId" value={account.membership_id} />
        <div className="field"><label htmlFor="portal-revoke-reason">Lý do</label>
          <textarea id="portal-revoke-reason" name="reason" minLength={3} maxLength={300} required /></div>
        {state?.message && <p className="form-message" role="alert">{state.message}</p>}
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" className="button button-danger" disabled={pending}>{pending ? "Đang thu hồi..." : "Thu hồi"}</button></div>
      </form>}
  </Dialog>;
}
