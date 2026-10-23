import Link from "next/link";
import { redirect } from "next/navigation";
import { roleLabel } from "@/components/access/presentation";
import styles from "@/components/portal/portal.module.css";
import { displayLogin, isPhoneLogin } from "@/lib/auth/login-identifier";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { catalogChoiceLabel } from "@/modules/catalog/presentation";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import type { CustomerPortalAccount } from "@/modules/portal/types";

const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
  <div className={styles.kv}><span>{label}</span><strong>{value === undefined || value === null || value === "" ? "Chưa cập nhật" : value}</strong></div>;

/** FB7 (Owner 22/10): "Tài khoản" — how the customer signs in, their details at the store and where goods are delivered. */
export default async function CustomerAccountPage() {
  const context = await authenticatedPortalClient();
  if (!context) redirect("/customer/login");
  const account = await portalRpc<CustomerPortalAccount>(context.supabase, "customer_portal_account", { target_customer_id: null });
  const { customer, sites } = account;
  const login = context.user.email ?? "";
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Tài khoản</h1><p>Thông tin đăng nhập và thông tin của bạn tại cửa hàng.</p></div>
      </header>
      <section className={styles.card} aria-labelledby="account-login">
        <h2 id="account-login">Đăng nhập</h2>
        <Row label={isPhoneLogin(login) ? "Số điện thoại đăng nhập" : "Email đăng nhập"} value={displayLogin(login)} />
        <Row label="Lần đăng nhập gần nhất" value={context.user.last_sign_in_at ? formatBusinessDateTime(context.user.last_sign_in_at) : null} />
        <Row label="Vai trò" value={roleLabel(account.membership_role)} />
        <div className={styles.actions}>
          <Link className={styles.buttonSecondary} href="/customer/change-password?from=account">Đổi mật khẩu</Link>
          <form action="/auth/logout" method="post"><input type="hidden" name="surface" value="customer" /><button className={styles.buttonSecondary} type="submit">Đăng xuất</button></form>
        </div>
      </section>
      <section className={styles.card} aria-labelledby="account-customer">
        <h2 id="account-customer">Thông tin khách hàng</h2>
        <Row label="Tên" value={customer.display_name} />
        <Row label="Mã khách hàng" value={customer.code} />
        {customer.customer_type && <Row label="Loại khách" value={catalogChoiceLabel(customer.customer_type)} />}
        <Row label="Điện thoại" value={customer.phone} />
        <Row label="Email liên hệ" value={customer.email} />
        <Row label="Địa chỉ" value={customer.address_text} />
        {customer.tax_code && <Row label="Mã số thuế" value={customer.tax_code} />}
        {customer.payment_terms_days != null && <Row label="Hạn thanh toán" value={customer.payment_terms_days ? `${customer.payment_terms_days} ngày sau khi giao` : "Thanh toán khi nhận hàng"} />}
        <p className={styles.hint}>Cần sửa thông tin? <Link href="/customer/messages">Nhắn cửa hàng</Link> để được cập nhật.</p>
      </section>
      <section className={styles.card} aria-labelledby="account-sites">
        <h2 id="account-sites">Địa chỉ giao hàng ({sites.length})</h2>
        {sites.length ? sites.map((site) => <article className={styles.kv} key={site.id}>
          <span>{site.name}<br /><small>{site.address_text}</small></span>
          <strong>{[site.receiver_name, site.receiver_phone].filter(Boolean).join(" · ") || "Chưa có người nhận"}</strong>
        </article>) : <p className={styles.empty}>Chưa có địa chỉ giao hàng.</p>}
        <p className={styles.hint}>Thêm địa chỉ mới ngay khi đặt hàng: chọn “+ Địa chỉ giao mới” ở mục Giao tới.</p>
      </section>
    </div>
  );
}
