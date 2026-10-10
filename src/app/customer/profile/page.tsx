import { roleLabel } from "@/components/access/presentation";
import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";

export default async function CustomerProfilePage() {
  const snapshot = await getCustomerPortalSnapshot();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Hồ sơ khách hàng</h1><p>Quyền truy cập được kiểm tra mỗi khi bạn mở trang.</p></div>
      </header>
      <section className={styles.card}>
        <div className={styles.kv}><span>Khách hàng</span><strong>{snapshot.customer.display_name}</strong></div>
        <div className={styles.kv}><span>Mã khách hàng</span><strong>{snapshot.customer.code}</strong></div>
        <div className={styles.kv}><span>Vai trò truy cập</span><strong>{roleLabel(snapshot.membership_role)}</strong></div>
      </section>
    </div>
  );
}
