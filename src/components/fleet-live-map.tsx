import { LocateFixed, MapPinned, Radio, SignalHigh, SignalLow, WifiOff } from "lucide-react";

import type { FleetTrackingSnapshot, GpsFreshnessStatus } from "@/modules/gps/types";

function freshnessIcon(status: GpsFreshnessStatus) {
  if (status === "LIVE") return <SignalHigh aria-hidden="true" />;
  if (status === "STALE") return <SignalLow aria-hidden="true" />;
  return <WifiOff aria-hidden="true" />;
}

function freshnessLabel(status: GpsFreshnessStatus) {
  if (status === "LIVE") return "Đang có tín hiệu";
  if (status === "STALE") return "Mất tín hiệu vị trí";
  return "Ngoại tuyến / chưa rõ";
}

export function FleetLiveMap({ data }: { data: FleetTrackingSnapshot }) {
  return <section className="commercial-panel fleet-live-map" aria-labelledby="fleet-live-map-heading">
    <div className="commercial-section-heading">
      <div><p className="page-context">GPS1 · Điều phối được cấp quyền</p><h2 id="fleet-live-map-heading">Bản đồ xe đang giao</h2><p>Vị trí là telemetry vận hành. Không làm thay đổi trạng thái Delivery, phân công hay thứ tự lộ trình.</p></div>
      <MapPinned aria-hidden="true" size={30} />
    </div>
    <p className="fleet-provider-note"><LocateFixed aria-hidden="true" />{data.providerMessage}</p>
    {data.locations.length ? <div className="fleet-location-grid" aria-label="Vị trí xe đang giao">
      {data.locations.map((location) => <article className={`fleet-location-card fleet-location-${location.freshness.toLowerCase()}`} key={location.vehicleId}>
        <header><div><strong>{location.vehicleName}</strong><span>{location.workerName} · {location.deliveryNumber}</span></div><b>{freshnessIcon(location.freshness)}{freshnessLabel(location.freshness)}</b></header>
        <dl>
          <div><dt>Điểm đến</dt><dd>{location.nextDestination}</dd></div>
          <div><dt>Tọa độ</dt><dd>{location.latitude}, {location.longitude}</dd></div>
          <div><dt>Độ chính xác</dt><dd>± {Number(location.accuracyM).toLocaleString("vi-VN")} m</dd></div>
          <div><dt>Cập nhật</dt><dd>{new Date(location.recordedAt).toLocaleString("vi-VN")}</dd></div>
        </dl>
        <p><Radio aria-hidden="true" /><span><strong>ETA ước tính</strong>{location.etaMessage}</span></p>
      </article>)}
    </div> : <div className="fleet-empty"><WifiOff aria-hidden="true" /><p>Chưa có xe nào đang chia sẻ vị trí trong chuyến giao hoạt động.</p></div>}
  </section>;
}
