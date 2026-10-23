// FB10 (6.10): foreground GPS is on. A worker shares the position of a delivery they are assigned to while the page is open
// (browsers do not send it in the background); the office sees the trucks on an OpenStreetMap map refreshed every 15 s.
export const GPS_DEVICE_AVAILABLE = true;
export const GPS_DEVICE_UNAVAILABLE_MESSAGE = "Chưa bật chia sẻ vị trí. Phân công và báo giao vẫn hoạt động bình thường.";
/** A position is sent at most this often (the office map refreshes on the same rhythm). */
export const GPS_PING_INTERVAL_MS = 15_000;
