"use client";

import styles from "@/components/portal/portal.module.css";
import { useShiftLocationState, type ShiftLocationState } from "@/components/routing/shift-location-tracker";

const TEXT: Record<ShiftLocationState, { title: string; body: string }> = {
  off: { title: "Chưa vào ca", body: "Vị trí chỉ được chia sẻ trong ca làm. Bấm Vào ca ở trang Hôm nay hoặc Chấm công, vị trí sẽ tự bật." },
  waiting: { title: "Đang lấy vị trí…", body: "Nếu trình duyệt hỏi quyền vị trí, hãy bấm Cho phép." },
  sharing: { title: "Đang chia sẻ vị trí trong ca", body: "Văn phòng thấy vị trí của bạn trên bản đồ Điều phối, cập nhật khoảng 15 giây một lần. Ra ca thì tự dừng." },
  denied: { title: "Chưa cho phép vị trí", body: "Bạn đang trong ca nhưng trình duyệt chặn vị trí. Mở cài đặt trang web (biểu tượng ổ khóa cạnh địa chỉ), cho phép Vị trí rồi tải lại trang." },
  unsupported: { title: "Máy không hỗ trợ định vị", body: "Thiết bị hoặc trình duyệt này không lấy được vị trí. Giao việc và báo giao vẫn dùng bình thường." },
};

/** FB18 (D40): what the shift location tracker in the portal shell is doing right now. */
export function ShiftLocationStatus() {
  const state = useShiftLocationState();
  const text = TEXT[state];
  return <section className={styles.card} aria-live="polite">
    <span className={styles.badge}>{state === "sharing" ? "Đang bật" : state === "off" ? "Ngoài ca" : state === "waiting" ? "Đang bật" : "Cần xử lý"}</span>
    <h2>{text.title}</h2>
    <p>{text.body}</p>
  </section>;
}
