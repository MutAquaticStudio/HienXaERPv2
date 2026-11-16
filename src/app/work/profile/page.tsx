import { cookies } from "next/headers";
import Link from "next/link";
import { ChevronRight, Clock3, KeyRound, LogOut, MapPin, MessageSquare } from "lucide-react";
import { PortalAppearance } from "@/components/portal/portal-appearance";
import styles from "@/components/portal/portal.module.css";
import { PushToggle } from "@/components/notifications/push-toggle";
import { openedInAppWithoutPush, openedInNativeApp } from "@/lib/app-shell/server";
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/appearance";
import { AnnouncementHistory } from "@/components/announcements/announcement-history";
import { loadAnnouncementHistory } from "@/modules/announcements/server";
import { getWorkerPortalSnapshot } from "@/modules/portal/actions";

export default async function WorkProfilePage() {
  const { employee } = await getWorkerPortalSnapshot();
  const [inApp, appWithoutPush] = await Promise.all([openedInNativeApp(), openedInAppWithoutPush()]);
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
  const announcements = await loadAnnouncementHistory("WORKER");
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
      <section className={styles.card} aria-labelledby="work-announcements">
        <h2 id="work-announcements">Thông báo từ cửa hàng</h2>
        <AnnouncementHistory items={announcements} surface="WORKER" emptyText="Chưa có thông báo nào. Đơn giá công đổi hoặc tin mới của văn phòng sẽ hiện ở đây." />
      </section>
      {/* D86: the Android app 2.3.0+ receives push itself; an older app cannot, and its workers are not told about it (D82). */}
      {!appWithoutPush && <section className={styles.card}>
        <h2>Báo việc mới về điện thoại</h2>
        <PushToggle />
        {!inApp && <p className={styles.hint}>Chưa cài app? <Link href="/tai-app">Tải app Hiền Xa cho điện thoại</Link>.</p>}
      </section>}
      <PortalAppearance initial={appearance} />
      <form action="/auth/logout" method="post">
        <input type="hidden" name="surface" value="work" />
        <button className={styles.buttonSecondary} type="submit"><LogOut aria-hidden size={18} />Đăng xuất</button>
      </form>
    </div>
  );
}
