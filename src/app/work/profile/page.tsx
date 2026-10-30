import Link from "next/link";
import { ChevronRight, Clock3, KeyRound, LogOut, MapPin, MessageSquare } from "lucide-react";
import styles from "@/components/portal/portal.module.css";
import { PushToggle } from "@/components/notifications/push-toggle";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";

export default async function WorkProfilePage() {
  const { employee } = await getWorkerPortalSnapshot();
  return (
    <div className={styles.page}>
      <header className={styles.sectionHead}>
        <div><h1>Tôi</h1><p>Hồ sơ, chấm công và các mục khác.</p></div>
      </header>
      <nav className={`${styles.card} ${styles.menuList}`} aria-label="Mục khác">
        <Link href="/work/attendance"><Clock3 aria-hidden size={19} /><span>Chấm công</span><ChevronRight aria-hidden size={18} /></Link>
        <Link href="/work/tracking"><MapPin aria-hidden size={19} /><span>Chia sẻ vị trí</span><ChevronRight aria-hidden size={18} /></Link>
        <Link href="/work/messages"><MessageSquare aria-hidden size={19} /><span>Tin nhắn</span><ChevronRight aria-hidden size={18} /></Link>
        <Link href="/work/change-password"><KeyRound aria-hidden size={19} /><span>Đổi mật khẩu</span><ChevronRight aria-hidden size={18} /></Link>
      </nav>
      <section className={styles.card}>
        <div className={styles.kv}><span>Họ tên</span><strong>{employee.display_name}</strong></div>
        <div className={styles.kv}><span>Mã nhân sự</span><strong>{employee.code}</strong></div>
        <p className={styles.hint}>Nếu quyền chi nhánh hoặc phân công bị thu hồi, lần đọc tiếp theo sẽ bị chặn ngay.</p>
      </section>
      <section className={styles.card}>
        <h2>Báo việc mới về điện thoại</h2>
        <PushToggle />
      </section>
      <form action="/auth/logout" method="post">
        <input type="hidden" name="surface" value="work" />
        <button className={styles.buttonSecondary} type="submit"><LogOut aria-hidden size={18} />Đăng xuất</button>
      </form>
    </div>
  );
}
