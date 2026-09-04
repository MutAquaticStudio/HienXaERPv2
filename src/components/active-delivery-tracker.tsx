"use client";

import { useEffect, useRef, useState } from "react";
import { CircleAlert, LocateFixed, MapPinOff, Radio, Square } from "lucide-react";

import {
  runGpsLocationAction,
  type GpsLocationActionState,
} from "@/app/work/actions";
import type { WorkerTrackingSnapshot } from "@/modules/gps/types";
import type { GpsFreshnessStatus } from "@/modules/gps/types";

const initialState: GpsLocationActionState = {
  status: "idle",
  message: "",
  idempotencyKey: "gps-initial-key",
};

function freshnessLabel(freshness: GpsFreshnessStatus | "UNKNOWN") {
  if (freshness === "LIVE") return "Vị trí mới cập nhật";
  if (freshness === "STALE") return "Mất tín hiệu vị trí — điều phối đang thấy điểm cũ";
  if (freshness === "OFFLINE") return "Chưa có vị trí mới";
  return "Chưa gửi vị trí trong chuyến này";
}

export function ActiveDeliveryTracker({
  snapshot,
  initialKey,
}: {
  snapshot: WorkerTrackingSnapshot;
  initialKey: string;
}) {
  const [tracking, setTracking] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [lastRecordedAt, setLastRecordedAt] = useState(snapshot.activeDelivery?.lastRecordedAt ?? null);
  const watchId = useRef<number | null>(null);
  const lastAttemptAt = useRef(0);
  const idempotencyKey = useRef(initialKey);

  function stopTracking(message = "Đã dừng chia sẻ vị trí trên trình duyệt này.") {
    if (watchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setTracking(false);
    setRequesting(false);
    setFeedback(message);
  }

  async function sendPosition(position: GeolocationPosition) {
    const now = Date.now();
    if (now - lastAttemptAt.current < 20_000) return;
    lastAttemptAt.current = now;
    if (!navigator.onLine) {
      setFeedback("Chưa có mạng nên chưa gửi vị trí mới. Điều phối chỉ thấy vị trí đã nhận trước đó.");
      return;
    }
    const formData = new FormData();
    formData.set("kind", "gps.location.record");
    formData.set("idempotencyKey", idempotencyKey.current);
    formData.set("latitude", position.coords.latitude.toFixed(7));
    formData.set("longitude", position.coords.longitude.toFixed(7));
    formData.set("accuracyM", Math.max(position.coords.accuracy, 0.01).toFixed(2));
    if (position.coords.speed !== null && Number.isFinite(position.coords.speed)) {
      formData.set("speedMps", Math.max(position.coords.speed, 0).toFixed(3));
    }
    if (position.coords.heading !== null && Number.isFinite(position.coords.heading)) {
      formData.set("headingDeg", Math.max(position.coords.heading, 0).toFixed(3));
    }
    formData.set("recordedAt", new Date(position.timestamp).toISOString());
    const result = await runGpsLocationAction(
      { ...initialState, idempotencyKey: idempotencyKey.current },
      formData,
    );
    idempotencyKey.current = result.idempotencyKey;
    if (result.shouldStopTracking) {
      stopTracking(result.message);
      return;
    }
    setFeedback(result.message);
    if (result.status === "success") setLastRecordedAt(new Date(position.timestamp).toISOString());
  }

  function beginWatch() {
    if (watchId.current !== null) return;
    if (!navigator.geolocation) {
      setFeedback("Thiết bị không hỗ trợ vị trí. Bạn vẫn có thể tiếp tục chuyến giao.");
      return;
    }
    if (!navigator.onLine) {
      setFeedback("Chưa có mạng. Hãy kết nối lại rồi bật chia sẻ vị trí.");
      return;
    }
    setFeedback("Đang xin quyền vị trí và lấy điểm đầu tiên…");
    setRequesting(true);
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setRequesting(false);
        setTracking(true);
        void sendPosition(position);
      },
      () => {
        stopTracking("Không nhận được vị trí. Hãy cấp quyền vị trí rồi thử lại; công việc và chuyến giao không bị thay đổi.");
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 15_000 },
    );
    watchId.current = id;
  }

  useEffect(() => {
    if (snapshot.activeDelivery) return;
    if (watchId.current !== null) stopTracking("Chuyến không còn ở trạng thái giao đang hoạt động; hệ thống đã dừng chia sẻ vị trí.");
  }, [snapshot.activeDelivery]);

  useEffect(() => () => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
  }, []);

  const active = snapshot.activeDelivery;
  return (
    <section className="gps-tracker" aria-labelledby="gps-tracker-heading">
      <div className="gps-tracker-heading">
        <div>
          <p className="page-context">GPS1 · chỉ trong lúc đang giao</p>
          <h2 id="gps-tracker-heading">Chia sẻ vị trí chuyến giao</h2>
        </div>
        {tracking ? <Radio aria-hidden="true" className="gps-live-icon" /> : <LocateFixed aria-hidden="true" />}
      </div>
      {active ? <>
        <div className={tracking ? "gps-tracking-state gps-tracking-state-live" : "gps-tracking-state"}>
          {tracking ? <Radio aria-hidden="true" /> : <MapPinOff aria-hidden="true" />}
          <div><strong>{tracking ? "ĐANG CHIA SẺ VỊ TRÍ" : requesting ? "ĐANG XIN QUYỀN VỊ TRÍ" : freshnessLabel(active.freshness)}</strong><span>Đơn {active.deliveryNumber} · {active.vehicleName}</span></div>
        </div>
        <p className="gps-tracker-copy">Hiền Xa chỉ dùng vị trí khi trình duyệt này đang mở và bạn đang giao chuyến trên. Không theo dõi khi màn hình khóa, trình duyệt bị treo hoặc bạn dừng chia sẻ.</p>
        {lastRecordedAt ? <p className="gps-last-seen">Lần gần nhất: {new Date(lastRecordedAt).toLocaleString("vi-VN")}</p> : null}
        <div className="gps-tracker-actions">
          {!tracking && !requesting ? <button className="primary-button gps-action" onClick={beginWatch} type="button"><LocateFixed />CHO PHÉP VỊ TRÍ VÀ BẮT ĐẦU</button> : <button className="secondary-button gps-action" onClick={() => stopTracking()} type="button"><Square />DỪNG CHIA SẺ VỊ TRÍ</button>}
        </div>
      </> : <div className="gps-tracker-unavailable"><CircleAlert aria-hidden="true" /><p>{snapshot.availabilityMessage ?? "Chưa có chuyến giao phù hợp để bật vị trí."}</p></div>}
      {feedback ? <p aria-live="polite" className="worker-feedback gps-feedback">{feedback}</p> : null}
    </section>
  );
}
