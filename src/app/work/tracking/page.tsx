import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { ForegroundGpsControl } from "@/components/routing/foreground-gps-control";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import styles from "@/components/portal/portal.module.css";
import { GPS_DEVICE_AVAILABLE, GPS_DEVICE_UNAVAILABLE_MESSAGE } from "@/modules/routing/device-availability";

export default async function WorkerTrackingPage() {
  await requireInternalAccess("/work/login");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("my_active_delivery_assignments");
  if (error) throw error;
  return (
    <div className={styles.page}>
      <header className={styles.hero}><p className={styles.heroEyebrow}>Giao hàng</p><h1>Chia sẻ vị trí</h1><p>{GPS_DEVICE_AVAILABLE ? "Chỉ bật GPS khi bạn đang thực hiện chuyến giao được phân. Rời trang hoặc tắt màn hình sẽ dừng chia sẻ." : GPS_DEVICE_UNAVAILABLE_MESSAGE}</p></header>
      {(data ?? []).length ? <div className={styles.gridTwo}>{(data ?? []).map((row: {
        delivery_id: string;
        assignment_version: number;
        delivery_number: string;
        customer_name: string;
        site_name: string;
        address_text: string;
        execution_state: string;
      }) => <section className={styles.card} key={row.delivery_id}>
        <span className={styles.badge}>{deliveryStateLabel(row.execution_state)}</span>
        <h2>{row.delivery_number} · {row.site_name}</h2>
        <p>{row.customer_name} · {row.address_text}</p>
        {GPS_DEVICE_AVAILABLE && <ForegroundGpsControl deliveryId={row.delivery_id} assignmentVersion={row.assignment_version} />}
      </section>)}</div> : <section className={styles.card}><p>Không có chuyến giao đang được phân cho bạn.</p></section>}
    </div>
  );
}
