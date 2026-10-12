import { formatBusinessDateTime } from "@/lib/core/business-time";
import { routePlanStateLabel } from "@/modules/routing/presentation";
import Link from "next/link";
import { ApplyRoutePlanButton, RoutePlanForm } from "@/components/routing/route-plan-controls";
import { loadFleetSnapshot, loadRoutingWorkspace } from "@/modules/routing/server";

export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const [workspace, fleet] = await Promise.all([loadRoutingWorkspace(plan), loadFleetSnapshot()]);
  const canAssign = Array.from(workspace.access.permissions).includes("delivery.assign");
  const stopLabels = new Map(workspace.deliveries.map((delivery) => [delivery.id, delivery.delivery_number]));
  return (
    <div className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Điều phối</p><h1>Lộ trình &amp; vị trí</h1><p className="lede">Lộ trình là bản đề xuất. Phân công chỉ thay đổi sau khi bạn bấm Áp dụng và phân giao.</p></div></header>
      {canAssign && <section className="card card-pad"><h2>Tạo đề xuất</h2><RoutePlanForm deliveries={workspace.deliveries} vehicles={workspace.vehicles} employees={workspace.employees} /></section>}
      <section className="card card-pad"><h2>Lộ trình gần đây</h2>{workspace.plans.length ? <div className="clean-list">{workspace.plans.map((item) => <Link className="detail-item" key={item.id} href={`/admin/routes?plan=${item.id}`}><strong>{formatBusinessDateTime(item.departure_at)}</strong><span>{item.provider_state === "MANUAL_FALLBACK" ? "Thứ tự thủ công" : "Nhà cung cấp đề xuất"} · {routePlanStateLabel(item.status)}</span><span className="mono">{item.id.slice(0, 8)}</span></Link>)}</div> : <p className="empty-inline">Chưa có lộ trình.</p>}</section>
      {workspace.selectedPlan && <section className="card card-pad"><div className="section-head flush"><div><h2>Lộ trình · {routePlanStateLabel(workspace.selectedPlan.status)}</h2><p className="muted">Khởi hành {formatBusinessDateTime(workspace.selectedPlan.departure_at)}</p></div></div>
        {workspace.selectedPlan.provider_state === "MANUAL_FALLBACK" ? <p role="status" className="scope-chip">Thứ tự thủ công: {workspace.selectedPlan.provider_error_safe ?? "Dịch vụ bản đồ tạm thời không khả dụng."}</p> : <p className="scope-chip">Đề xuất từ dịch vụ bản đồ · {workspace.selectedPlan.provider_distance_meters?.toLocaleString("vi-VN") ?? "?"} m · {workspace.selectedPlan.provider_duration_seconds?.toLocaleString("vi-VN") ?? "?"} giây</p>}
        <ol>{workspace.stops.map((stop) => <li key={stop.id} className="detail-item"><strong><Link className="code-link" href={`/admin/deliveries/${stop.delivery_id}`}>{stopLabels.get(stop.delivery_id) ?? stop.delivery_id}</Link> · {stop.address_snapshot}</strong><span>Khung giờ: {stop.time_window_snapshot ?? "Chưa có"}</span>{stop.capacity_warning && <span className="scope-chip">Tải trọng: {stop.capacity_warning}</span>}{stop.time_window_warning && <span className="scope-chip">Khung giờ: {stop.time_window_warning}</span>}{stop.latitude !== null && stop.longitude !== null && <a className="code-link" href={`https://www.openstreetmap.org/?mlat=${stop.latitude}&mlon=${stop.longitude}#map=16/${stop.latitude}/${stop.longitude}`} target="_blank" rel="noreferrer">Mở bản đồ điểm giao</a>}</li>)}</ol>
        {canAssign && workspace.selectedPlan.status === "DRAFT" && <ApplyRoutePlanButton planId={workspace.selectedPlan.id} version={workspace.selectedPlan.version} />}
      </section>}
      <section className="card card-pad"><h2>Vị trí đội xe hiện tại</h2><p className="muted">Vị trí chỉ hỗ trợ theo dõi đội xe. Tín hiệu cũ không có nghĩa là chuyến giao thất bại.</p>
        {fleet.length ? <div className="table-wrap"><table><thead><tr><th>Chuyến giao</th><th>Xe / nhân sự</th><th>Vị trí</th><th>Cập nhật</th></tr></thead><tbody>{fleet.map((item) => <tr key={item.session_id}><td><Link className="code-link" href={`/admin/deliveries/${item.delivery_id}`}>{item.delivery_number}</Link></td><td>{item.plate_number} · {item.employee_name}</td><td><a className="code-link" href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=16/${item.latitude}/${item.longitude}`} target="_blank" rel="noreferrer">Mở vị trí</a></td><td>{formatBusinessDateTime(item.received_at)}{item.is_stale && <span className="scope-chip">Tín hiệu cũ</span>}</td></tr>)}</tbody></table></div> : <p className="empty-inline">Chưa có vị trí từ chuyến giao đang được phân công.</p>}
      </section>
    </div>
  );
}
