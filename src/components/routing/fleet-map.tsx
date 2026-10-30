"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { CircleMarker, LayerGroup, Map as LeafletMap, Polyline } from "leaflet";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { GPS_PING_INTERVAL_MS } from "@/modules/routing/device-availability";

/** FB18 (D40): one worker on shift — the latest position their phone sent, and the delivery they are on (if any). */
export type FleetPosition = { employee_id: string; employee_name: string; latitude: number | string; longitude: number | string;
  captured_at: string; is_stale: boolean; delivery_number?: string | null; plate_number?: string | null };
type TrailPoint = { latitude: number; longitude: number; capturedAt: string };

const onTrip = (worker: FleetPosition) => worker.delivery_number ? `Đang giao ${worker.delivery_number}${worker.plate_number ? ` · ${worker.plate_number}` : ""}` : "Không có chuyến giao";
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/** Default view (Việt Nam) until a worker shares their position. */
const VIETNAM: [number, number] = [16.0, 106.0];

/** FB10 / FB18 (D40): workers on shift on an OpenStreetMap map, refreshed every 15 s; pick one to see their path this shift. */
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
        const response = await fetch(`/api/gps/fleet${selected ? `?employee=${selected}` : ""}`, { cache: "no-store" });
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
      for (const worker of fleet) {
        const at: [number, number] = [Number(worker.latitude), Number(worker.longitude)];
        if (!Number.isFinite(at[0]) || !Number.isFinite(at[1])) continue;
        points.push(at);
        const marker: CircleMarker = L.circleMarker(at, { radius: worker.employee_id === selected ? 11 : 8, weight: 3, color: "#fff",
          fillColor: worker.is_stale ? "#9ca3af" : "#1769c2", fillOpacity: 1 })
          .bindTooltip(escapeHtml(worker.employee_name), { permanent: true, direction: "top", offset: [0, -8] })
          .bindPopup(`<strong>${escapeHtml(worker.employee_name)}</strong><br>${escapeHtml(onTrip(worker))}<br>${formatBusinessDateTime(worker.captured_at)}${worker.is_stale ? "<br>Mất tín hiệu" : ""}`);
        marker.on("click", () => setSelected(worker.employee_id));
        marker.addTo(layer.current);
      }
      trailLine.current?.remove();
      trailLine.current = trail.length > 1 ? L.polyline(trail.map((point) => [point.latitude, point.longitude] as [number, number]), { color: "#1769c2", weight: 4, opacity: 0.7 }).addTo(map.current) : null;
      if (!fitted.current && points.length) { map.current.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 }); fitted.current = true; }
    });
  }, [fleet, trail, selected]);

  return <section className="card fleet-map-card" aria-label="Bản đồ vị trí thợ">
    <div className="section-head"><h2>Vị trí thợ trong ca</h2>
      <span className="scope-chip" role="status">{failed ? "Mất kết nối, đang thử lại…" : updatedAt ? `Cập nhật ${updatedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · tự làm mới 15 giây` : "Đang tải bản đồ…"}</span></div>
    <div className="fleet-map-layout">
      <div ref={holder} className="fleet-map" />
      <ul className="fleet-map-list">
        {fleet.map((worker) => <li key={worker.employee_id}><button type="button" className={worker.employee_id === selected ? "active" : undefined} onClick={() => setSelected(worker.employee_id === selected ? null : worker.employee_id)}>
          <strong>{worker.employee_name}</strong><span>{onTrip(worker)}</span>
          <small>{worker.is_stale ? "Mất tín hiệu · " : ""}{formatBusinessDateTime(worker.captured_at)}</small></button></li>)}
        {!fleet.length && <li className="muted">Chưa có thợ nào trong ca gửi vị trí. Vị trí tự bật khi thợ Vào ca và mở cổng nhân sự trên điện thoại.</li>}
      </ul>
    </div>
    {selected && <p className="muted">Đường màu xanh là đường đi trong ca của người đã chọn. Bấm lại tên để bỏ chọn.</p>}
  </section>;
}
