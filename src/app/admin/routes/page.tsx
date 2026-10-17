import { formatBusinessDateTime } from "@/lib/core/business-time";
import { routePlanStateLabel, windowLabel } from "@/modules/routing/presentation";
import Link from "next/link";
import { ApplyRoutePlanButton, RoutePlanForm } from "@/components/routing/route-plan-controls";
import { StatusBadge } from "@/components/ui/status-badge";
import { loadFleetSnapshot, loadRoutingWorkspace } from "@/modules/routing/server";

const stateTone = (status: string): "success" | "danger" | "warning" => status === "APPLIED" ? "success" : status === "CANCELLED" ? "danger" : "warning";

/** Lộ trình (FB2 Đợt 7): an opened plan with its stop times, the 3-step planner, recent plans as a table, fleet positions. */
export default async function RoutesPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  const [workspace, fleet] = await Promise.all([loadRoutingWorkspace(plan), loadFleetSnapshot()]);
  const canAssign = Array.from(workspace.access.permissions).includes("delivery.assign");
  const stopDeliveries = new Map(workspace.stopDeliveries.map((delivery) => [delivery.id, delivery]));
  const vehicleLabel = new Map(workspace.vehicles.map((vehicle) => [vehicle.id, vehicle.plate_number]));
  const driverLabel = new Map(workspace.employees.map((employee) => [employee.id, employee.display_name]));
  const selected = workspace.selectedPlan;
  return (
    <div className="page-stack">
      <header className="page-heading"><div><p className="eyebrow">Điều phối</p><h1>Lộ trình &amp; vị trí</h1><p className="lede">Lộ trình là bản đề xuất. Phân công chỉ thay đổi sau khi bạn bấm Áp dụng và phân giao.</p></div>
        {canAssign && <div className="action-cluster"><a className="button button-primary" href="#tao-lo-trinh">Tạo lộ trình</a></div>}</header>

      {selected && <section className="card card-pad" aria-label="Lộ trình đang xem"><div className="section-head flush"><div><h2>Lộ trình · {routePlanStateLabel(selected.status)}</h2>
          <p className="muted">Khởi hành {formatBusinessDateTime(selected.departure_at)} · {vehicleLabel.get(selected.vehicle_id) ?? "Xe"} · {driverLabel.get(selected.driver_employee_id) ?? "Tài xế"}</p></div>
          <Link className="code-link" href="/admin/routes">Đóng</Link></div>
        {selected.provider_state === "MANUAL_FALLBACK" ? <p role="status" className="scope-chip">Thứ tự thủ công: {selected.provider_error_safe ?? "Dịch vụ bản đồ tạm thời không khả dụng."}</p> : <p className="scope-chip">Đề xuất từ dịch vụ bản đồ · {selected.provider_distance_meters?.toLocaleString("vi-VN") ?? "?"} m · {selected.provider_duration_seconds === null ? "?" : Math.round(selected.provider_duration_seconds / 60).toLocaleString("vi-VN")} phút chạy xe</p>}
        <div className="table-wrap"><table className="route-stop-table">
          <thead><tr><th scope="col">#</th><th scope="col">Phiếu giao</th><th scope="col">Giờ dự kiến</th><th scope="col">Lịch khi áp dụng</th><th scope="col">Lưu ý</th></tr></thead>
          <tbody>{workspace.stops.map((stop) => {
            const delivery = stopDeliveries.get(stop.delivery_id);
            const keeps = !!delivery?.scheduled_at;
            return <tr key={stop.id}>
              <td data-label="#">{stop.stop_order}</td>
              <td data-label="Phiếu giao"><Link className="code-link" href={`/admin/deliveries/${stop.delivery_id}`}>{delivery?.delivery_number ?? "Phiếu giao"}</Link>
                <small className="table-subline">{stop.address_snapshot}</small>
                {stop.latitude !== null && stop.longitude !== null && <a className="code-link table-subline" href={`https://www.openstreetmap.org/?mlat=${stop.latitude}&mlon=${stop.longitude}#map=16/${stop.latitude}/${stop.longitude}`} target="_blank" rel="noreferrer">Mở bản đồ điểm giao</a>}</td>
              <td data-label="Giờ dự kiến">{stop.planned_start_at ? windowLabel(stop.planned_start_at, stop.planned_end_at) : <span className="muted">Chưa có</span>}</td>
              <td data-label="Lịch khi áp dụng">{keeps ? `Giữ lịch phiếu: ${windowLabel(delivery!.scheduled_at!, delivery!.scheduled_end_at)}` : stop.planned_start_at ? "Nhận giờ dự kiến" : <span className="muted">Chưa có giờ — tạo lại đề xuất</span>}</td>
              <td data-label="Lưu ý"><div className="route-stop-notes">
                <span>Khung nhận hàng: {stop.time_window_snapshot ?? "Chưa có"}</span>
                {stop.capacity_warning && <span className="scope-chip">Tải trọng: {stop.capacity_warning}</span>}
                {stop.time_window_warning && <span className="scope-chip">Khung giờ: {stop.time_window_warning}</span>}</div></td>
            </tr>;
          })}</tbody>
        </table></div>
        {canAssign && selected.status === "DRAFT" && <ApplyRoutePlanButton planId={selected.id} version={selected.version} />}
      </section>}

      {canAssign && <section className="card card-pad" id="tao-lo-trinh"><h2>Tạo lộ trình</h2><RoutePlanForm deliveries={workspace.deliveries} vehicles={workspace.vehicles} employees={workspace.employees} /></section>}

      <section className="card list-main"><div className="section-head"><h2>Lộ trình gần đây</h2><span className="scope-chip">20 gần nhất</span></div>
        <div className="table-wrap"><table className="row-link-table">
          <thead><tr><th scope="col">Khởi hành</th><th scope="col">Xe · tài xế</th><th scope="col" className="numeric">Điểm dừng</th><th scope="col">Thứ tự</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{workspace.plans.map((item) => <tr key={item.id} className={item.id === selected?.id ? "row-selected" : undefined}>
            <td data-label="Khởi hành"><Link className="row-link" href={`/admin/routes?plan=${item.id}`}>{formatBusinessDateTime(item.departure_at)}</Link></td>
            <td data-label="Xe · tài xế">{vehicleLabel.get(item.vehicle_id) ?? "Xe"} · {driverLabel.get(item.driver_employee_id) ?? "Tài xế"}</td>
            <td className="numeric" data-label="Điểm dừng">{workspace.stopCounts.get(item.id) ?? 0}</td>
            <td data-label="Thứ tự">{item.provider_state === "MANUAL_FALLBACK" ? "Thủ công" : "Bản đồ đề xuất"}</td>
            <td data-label="Trạng thái"><StatusBadge tone={stateTone(item.status)}>{routePlanStateLabel(item.status)}</StatusBadge></td>
          </tr>)}</tbody>
        </table>{!workspace.plans.length && <p className="empty-inline">Chưa có lộ trình.</p>}</div>
      </section>

      <section className="card card-pad"><h2>Vị trí đội xe hiện tại</h2><p className="muted">Vị trí chỉ hỗ trợ theo dõi đội xe. Tín hiệu cũ không có nghĩa là chuyến giao thất bại.</p>
        {fleet.length ? <div className="table-wrap"><table><thead><tr><th>Chuyến giao</th><th>Xe / nhân sự</th><th>Vị trí</th><th>Cập nhật</th></tr></thead><tbody>{fleet.map((item) => <tr key={item.session_id}><td><Link className="code-link" href={`/admin/deliveries/${item.delivery_id}`}>{item.delivery_number}</Link></td><td>{item.plate_number} · {item.employee_name}</td><td><a className="code-link" href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=16/${item.latitude}/${item.longitude}`} target="_blank" rel="noreferrer">Mở vị trí</a></td><td>{formatBusinessDateTime(item.received_at)}{item.is_stale && <span className="scope-chip">Tín hiệu cũ</span>}</td></tr>)}</tbody></table></div> : <p className="empty-inline">Chưa có vị trí từ chuyến giao đang được phân công.</p>}
      </section>
    </div>
  );
}
