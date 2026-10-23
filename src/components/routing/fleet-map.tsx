"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap, Polyline } from "leaflet";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { GPS_PING_INTERVAL_MS } from "@/modules/routing/device-availability";

export type FleetPosition = { session_id: string; delivery_id: string; delivery_number: string; plate_number: string; employee_name: string;
  latitude: number | string; longitude: number | string; captured_at: string; is_stale: boolean };
type TrailPoint = { latitude: number; longitude: number; capturedAt: string };

/** Default view (Việt Nam) until a truck shares its position. */
const VIETNAM: [number, number] = [16.0, 106.0];

/** FB10 (6.10): trucks on an OpenStreetMap map, refreshed every 15 s; pick a truck to see its trail for this trip. */
export function FleetMap({ initial }: { initial: FleetPosition[] }) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const trailLine = useRef<Polyline | null>(null);
  const fitted = useRef(false);
  const [fleet, setFleet] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !holder.current || map.current) return;
      map.current = L.map(holder.current, { zoomControl: true }).setView(VIETNAM, 6);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      setUpdatedAt(new Date());
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/gps/fleet${selected ? `?session=${selected}` : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error("fleet");
        const body = await response.json() as { fleet: FleetPosition[]; trail: TrailPoint[] };
        if (stop) return;
        setFleet(body.fleet); setTrail(body.trail); setUpdatedAt(new Date()); setFailed(false);
      } catch { if (!stop) setFailed(true); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, GPS_PING_INTERVAL_MS);
    return () => { stop = true; window.clearInterval(timer); };
  }, [selected]);

  useEffect(() => {
    void import("leaflet").then((L) => {
      if (!map.current || !layer.current) return;
      layer.current.clearLayers();
      const points: [number, number][] = [];
      for (const truck of fleet) {
        const at: [number, number] = [Number(truck.latitude), Number(truck.longitude)];
        if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue;
        points.push(at);
        const marker: CircleMarker = L.circleMarker(at, { radius: truck.session_id === selected ? 11 : 8, weight: 3, color: "#fff",
          fillColor: truck.is_stale ? "#9ca3af" : "#1769c2", fillOpacity: 1 })
          .bindTooltip(`${truck.plate_number} · ${truck.employee_name}`, { permanent: true, direction: "top", offset: [0, -8] })
          .bindPopup(`<strong>${truck.plate_number}</strong><br>${truck.employee_name}<br>${truck.delivery_number}<br>${formatBusinessDateTime(truck.captured_at)}${truck.is_stale ? "<br>Mất tín hiệu" : ""}`);
        marker.on("click", () => setSelected(truck.session_id));
        marker.addTo(layer.current);
      }
      trailLine.current?.remove();
      trailLine.current = trail.length > 1 ? L.polyline(trail.map((point) => [point.latitude, point.longitude] as [number, number]), { color: "#1769c2", weight: 4, opacity: 0.7 }).addTo(map.current) : null;
      if (!fitted.current && points.length) { map.current.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 }); fitted.current = true; }
    });
  }, [fleet, trail, selected]);

  return <section className="card fleet-map-card" aria-label="Bản đồ xe đang giao">
    <div className="section-head"><h2>Vị trí xe đang giao</h2>
      <span className="scope-chip" role="status">{failed ? "Mất kết nối, đang thử lại…" : updatedAt ? `Cập nhật ${updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · tự làm mới 15 giây` : "Đang tải bản đồ…"}</span></div>
    <div className="fleet-map-layout">
      <div ref={holder} className="fleet-map" />
      <ul className="fleet-map-list">
        {fleet.map((truck) => <li key={truck.session_id}><button type="button" className={truck.session_id === selected ? "active" : undefined} onClick={() => setSelected(truck.session_id === selected ? null : truck.session_id)}>
          <strong>{truck.plate_number}</strong><span>{truck.employee_name} · {truck.delivery_number}</span>
          <small>{truck.is_stale ? "Mất tín hiệu · " : ""}{formatBusinessDateTime(truck.captured_at)}</small></button></li>)}
        {!fleet.length && <li className="muted">Chưa có xe nào đang chia sẻ vị trí. Thợ bấm “Bật chia sẻ vị trí” trên việc giao hàng.</li>}
      </ul>
    </div>
    {selected && <p className="muted">Đường màu xanh là vệt đi của chuyến đã chọn. Bấm lại tên xe để bỏ chọn.</p>}
  </section>;
}
