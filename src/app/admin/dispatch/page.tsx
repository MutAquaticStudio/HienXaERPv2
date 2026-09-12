import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";

type Delivery = { id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string; result_kind: string | null; scheduled_at: string | null };

export default async function DispatchPage() {
  const access = await requireInternalPermission("delivery.read");
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("delivery_read").select("id, delivery_number, customer_name_snapshot, site_name_snapshot, execution_state, result_kind, scheduled_at").eq("branch_id", access.branchId).neq("execution_state", "CANCELLED").order("scheduled_at");
  const deliveries = (data ?? []) as Delivery[];
  const columns = [
    { title: "Chờ phân giao", rows: deliveries.filter((row) => row.execution_state === "PLANNED") },
    { title: "Đã phân giao", rows: deliveries.filter((row) => row.execution_state === "ASSIGNED") },
    { title: "Đang thực hiện", rows: deliveries.filter((row) => ["DISPATCHED", "ARRIVED", "RESULT_SUBMITTED"].includes(row.execution_state)) },
    { title: "Ngoại lệ", rows: deliveries.filter((row) => row.result_kind === "PARTIAL" || row.result_kind === "FAILED") },
  ];
  return <><header className="page-heading"><div><p className="eyebrow">Điều phối</p><h1>Bảng phân giao</h1><p className="lede">Mỗi cột là một trạng thái vận hành từ dữ liệu nguồn, không phải kanban shadow state.</p></div></header><section className="dispatch-board">{columns.map((column) => <div className="dispatch-column" key={column.title}><div className="dispatch-column-head"><h2>{column.title}</h2><span>{column.rows.length}</span></div>{column.rows.map((row) => <Link className="dispatch-ticket" href={`/admin/deliveries/${row.id}`} key={row.id}><strong className="mono">{row.delivery_number}</strong><span>{row.customer_name_snapshot}</span><small>{row.site_name_snapshot}</small><StatusBadge tone={deliveryStateTone(row.execution_state)}>{deliveryStateLabel(row.execution_state)}</StatusBadge></Link>)}{column.rows.length === 0 && <p className="muted dispatch-empty">Không có phiếu.</p>}</div>)}</section></>;
}
