import { ShiftLocationStatus } from "@/components/routing/shift-location-status";
import { requireInternalAccess } from "@/lib/access/context";
import styles from "@/components/portal/portal.module.css";

/** FB18 (D40): position sharing follows the shift — on from Vào ca to Ra ca while the worker portal is open. */
export default async function WorkerTrackingPage() {
  await requireInternalAccess("/work/login");
  return (
    <div className={styles.page}>
      <header className={styles.hero}><p className={styles.heroEyebrow}>Trong ca làm</p><h1>Chia sẻ vị trí</h1>
        <p>Từ lúc Vào ca tới Ra ca, khi bạn mở cổng nhân sự, máy tự gửi vị trí để văn phòng điều phối. Ngoài ca không gửi. Tắt màn hình hoặc đóng trình duyệt thì tạm dừng.</p></header>
      <ShiftLocationStatus />
    </div>
  );
}
