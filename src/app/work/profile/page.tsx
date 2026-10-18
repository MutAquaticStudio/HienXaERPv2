import styles from "@/components/portal/portal.module.css";
import { PushToggle } from "@/components/notifications/push-toggle";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";

export default async function WorkProfilePage() {
  const { employee } = await getWorkerPortalSnapshot();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Hồ sơ làm việc</h1><p>Thông tin từ hồ sơ nhân sự đang hoạt động.</p></div>
      </header>
      <section className={styles.card}>
        <div className={styles.kv}><span>Họ tên</span><strong>{employee.display_name}</strong></div>
        <div className={styles.kv}><span>Mã nhân sự</span><strong>{employee.code}</strong></div>
        <p className={styles.hint}>Nếu quyền chi nhánh hoặc phân công bị thu hồi, lần đọc tiếp theo sẽ bị chặn ngay.</p>
      </section>
      <section className={styles.card}>
        <h2>Báo việc mới về điện thoại</h2>
        <PushToggle />
      </section>
    </div>
  );
}
