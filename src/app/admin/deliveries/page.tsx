import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";

type Delivery = { id: string; sales_order_id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string; result_kind: string | null; scheduled_at: string | null; external_carrier_name: string | null; vehicle_id: string | null };

export default async function DeliveriesPage() {
  const access = await requireInternalPermission("delivery.read");
  const supabase = await createServerSupabase();
  const [{ data }, { data: vehicles }] = await Promise.all([
    supabase.from("delivery_read").select("id, sales_order_id, delivery_number, customer_name_snapshot, site_name_snapshot, execution_state, result_kind, scheduled_at, external_carrier_name, vehicle_id").eq("branch_id", access.branchId).order("created_at", { ascending: false }),
    supabase.from("vehicles").select("id, plate_number").eq("branch_id", access.branchId),
  ]);
  const vehicleMap = new Map((vehicles ?? []).map((row) => [row.id, row.plate_number]));
  const deliveries = (data ?? []) as Delivery[];
  return <><header className="page-heading"><div><p className="eyebrow">Thực hiện đơn</p><h1>Giao hàng</h1><p className="lede">Planned, actual, accepted và billable được giữ riêng theo từng phiếu.</p></div></header><section className="card"><div className="section-head"><h2>Phiếu giao</h2><StatusBadge tone="info">{deliveries.length}</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã phiếu</th><th>Khách / công trình</th><th>Lịch</th><th>Người/xe</th><th>Kết quả</th><th>Trạng thái</th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id}><td><Link className="code-link mono" href={`/admin/deliveries/${row.id}`}>{row.delivery_number}</Link></td><td>{row.customer_name_snapshot}<span className="table-subline">{row.site_name_snapshot}</span></td><td>{row.scheduled_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.scheduled_at)) : "Chưa hẹn"}</td><td>{row.external_carrier_name ?? (row.vehicle_id ? vehicleMap.get(row.vehicle_id) : "Chưa phân")}</td><td>{row.result_kind ? deliveryStateLabel(row.result_kind) : "Chưa có"}</td><td><StatusBadge tone={deliveryStateTone(row.execution_state)}>{deliveryStateLabel(row.execution_state)}</StatusBadge></td></tr>)}</tbody></table>{deliveries.length === 0 && <p className="empty-inline">Chưa có phiếu giao từ đơn đã đủ nguồn.</p>}</div></section></>;
}
