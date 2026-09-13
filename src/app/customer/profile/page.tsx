import styles from "@/components/portal/portal.module.css";
import { getCustomerPortalSnapshot } from "@/modules/portal/actions";

export default async function CustomerProfilePage() {
  const snapshot = await getCustomerPortalSnapshot();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Hồ sơ khách hàng</h1><p>Quyền được kiểm tra lại từ membership active ở mỗi request.</p></div>
      </header>
      <section className={styles.card}>
        <div className={styles.kv}><span>Khách hàng</span><strong>{snapshot.customer.display_name}</strong></div>
        <div className={styles.kv}><span>Mã khách hàng</span><strong>{snapshot.customer.code}</strong></div>
        <div className={styles.kv}><span>Vai trò portal</span><strong>{snapshot.membership_role}</strong></div>
      </section>
    </div>
  );
}
