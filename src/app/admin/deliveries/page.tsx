import Link from "next/link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";

type Delivery = { id: string; sales_order_id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string; result_kind: string | null; scheduled_at: string | null; external_carrier_name: string | null; vehicle_id: string | null; created_at: string };
type Query = { q?: string; state?: string; page?: string };

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("delivery.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  let request = supabase.from("delivery_read").select("id, sales_order_id, delivery_number, customer_name_snapshot, site_name_snapshot, execution_state, result_kind, scheduled_at, external_carrier_name, vehicle_id, created_at").eq("branch_id", access.branchId);
  if (list.q) request = request.or(`delivery_number.ilike.${ilikePattern(list.q)},customer_name_snapshot.ilike.${ilikePattern(list.q)},site_name_snapshot.ilike.${ilikePattern(list.q)},external_carrier_name.ilike.${ilikePattern(list.q)}`);
  if (list.state) request = request.eq("execution_state", list.state);
  const { data, error } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1);
  if (error) throw new Error("Không thể tải giao hàng.");
  const pageRows = (data ?? []) as Delivery[];
  const hasNext = pageRows.length > CORE_LIST_PAGE_SIZE;
  const deliveries = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
  const vehicleIds = [...new Set(deliveries.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id)))];
  const vehicleResult = vehicleIds.length ? await supabase.from("vehicles").select("id, plate_number").eq("branch_id", access.branchId).in("id", vehicleIds) : { data: [] };
  const vehicleMap = new Map((vehicleResult.data ?? []).map((row) => [row.id, row.plate_number]));
  return <><header className="page-heading"><div><p className="eyebrow">Thực hiện đơn</p><h1>Giao hàng</h1><p className="lede">Planned, actual, accepted và billable được giữ riêng theo từng phiếu.</p></div></header>
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã phiếu, khách, công trình, đầu mối" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="PLANNED">Kế hoạch</option><option value="ASSIGNED">Đã phân</option><option value="DISPATCHED">Đang giao</option><option value="ARRIVED">Đã tới</option><option value="RESULT_SUBMITTED">Chờ xác minh</option><option value="VERIFIED">Đã xác minh</option><option value="CANCELLED">Đã hủy</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state) && <Link className="code-link" href="/admin/deliveries">Xóa lọc</Link>}</form>
    <section className="card"><div className="section-head"><h2>{deliveries.length} phiếu giao trên trang này</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã phiếu</th><th>Khách / công trình</th><th>Lịch</th><th>Người/xe</th><th>Kết quả</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{deliveries.map((row) => <tr key={row.id}><td><Link className="code-link mono" href={`/admin/deliveries/${row.id}`}>{row.delivery_number}</Link></td><td>{row.customer_name_snapshot}<span className="table-subline">{row.site_name_snapshot}</span></td><td>{row.scheduled_at ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.scheduled_at)) : "Chưa hẹn"}</td><td>{row.external_carrier_name ?? (row.vehicle_id ? vehicleMap.get(row.vehicle_id) : "Chưa phân")}</td><td>{row.result_kind ? deliveryStateLabel(row.result_kind) : "Chưa có"}</td><td><StatusBadge tone={deliveryStateTone(row.execution_state)}>{deliveryStateLabel(row.execution_state)}</StatusBadge></td><td>{row.execution_state === "PLANNED" && access.permissions.has("delivery.exception") ? <Link className="code-link" href={`/admin/deliveries/${row.id}/cancel`}>Hủy kế hoạch</Link> : "-"}</td></tr>)}</tbody></table>{!deliveries.length && <p className="empty-inline">Không có phiếu giao phù hợp.</p>}</div><ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state }} /></section></>;
}
