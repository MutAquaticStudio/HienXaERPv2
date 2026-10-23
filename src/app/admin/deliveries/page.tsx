import Link from "next/link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExpandableRows } from "@/components/lists/expandable-rows";
import { ListFilterGroup, countText } from "@/components/lists/list-filter-group";
import { requireInternalPermission } from "@/lib/access/context";
import { CORE_LIST_PAGE_SIZE, parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";

type Delivery = { id: string; sales_order_id: string; delivery_number: string; customer_name_snapshot: string; site_name_snapshot: string; execution_state: string; result_kind: string | null; scheduled_at: string | null; external_carrier_name: string | null; vehicle_id: string | null; created_at: string };
type DeliveryLine = { id: string; delivery_id: string; material_name_snapshot: string; planned_base_quantity: string; actual_base_quantity: string | null; base_uom_symbol: string };
type Query = { q?: string; state?: string; page?: string };

const STATES = ["", "PLANNED", "ASSIGNED", "DISPATCHED", "RESULT_SUBMITTED", "VERIFIED", "CANCELLED"] as const;

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("delivery.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  const scoped = (state: string, select: string) => {
    let request = supabase.from("delivery_read").select(select).eq("branch_id", access.branchId);
    if (list.q) request = request.or(`delivery_number.ilike.${ilikePattern(list.q)},customer_name_snapshot.ilike.${ilikePattern(list.q)},site_name_snapshot.ilike.${ilikePattern(list.q)},external_carrier_name.ilike.${ilikePattern(list.q)}`);
    return state ? request.eq("execution_state", state) : request;
  };
  const [{ data, error }, ...counts] = await Promise.all([
    scoped(list.state, "id, sales_order_id, delivery_number, customer_name_snapshot, site_name_snapshot, execution_state, result_kind, scheduled_at, external_carrier_name, vehicle_id, created_at")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to + 1),
    ...STATES.map((state) => scoped(state, "id").limit(100)),
  ]);
  if (error) throw new Error("Không thể tải giao hàng.");
  const pageRows = (data ?? []) as unknown as Delivery[];
  const hasNext = pageRows.length > CORE_LIST_PAGE_SIZE;
  const deliveries = pageRows.slice(0, CORE_LIST_PAGE_SIZE);
  const ids = deliveries.map((row) => row.id);
  const vehicleIds = [...new Set(deliveries.map((row) => row.vehicle_id).filter((id): id is string => Boolean(id)))];
  const [vehicleResult, lineResult] = await Promise.all([
    vehicleIds.length ? supabase.from("vehicles").select("id, plate_number").eq("branch_id", access.branchId).in("id", vehicleIds) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("delivery_line_read").select("id, delivery_id, material_name_snapshot, planned_base_quantity, actual_base_quantity, base_uom_symbol").in("delivery_id", ids).order("id").limit(500) : Promise.resolve({ data: [] }),
  ]);
  const vehicleMap = new Map(((vehicleResult.data ?? []) as { id: string; plate_number: string }[]).map((row) => [row.id, row.plate_number]));
  const lines = (lineResult.data ?? []) as DeliveryLine[];
  const canCancel = access.permissions.has("delivery.exception");
  const who = (row: Delivery) => row.external_carrier_name ?? (row.vehicle_id ? vehicleMap.get(row.vehicle_id) ?? "Đã phân xe" : "Chưa phân");
  const isFiltered = Boolean(list.q || list.state);
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Giao hàng</p><h1>Phiếu giao</h1><p className="lede">Kế hoạch, thực giao và kết quả của từng phiếu. Mũi tên để xem nhanh hàng trên phiếu.</p></div></header>
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc phiếu giao">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã phiếu, khách, công trình, đầu mối" /></label>
        <ListFilterGroup key={list.state} legend="Trạng thái" name="state" value={list.state}
          options={STATES.map((state, index) => ({ value: state, label: state ? deliveryStateLabel(state) : "Tất cả", count: countText(counts[index].data) }))} />
        {isFiltered && <Link className="code-link" href="/admin/deliveries">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{deliveries.length} phiếu giao trên trang này</h2><span className="scope-chip">25 / trang</span></div>
        <div className="table-wrap"><table className="row-link-table">
          <thead><tr><th><span className="sr-only">Xem nhanh</span></th><th>Mã phiếu</th><th>Khách / công trình</th><th>Lịch</th><th>Người/xe</th><th>Kết quả</th><th>Trạng thái</th></tr></thead>
          <ExpandableRows columns={7} rows={deliveries.map((row) => {
            const href = `/admin/deliveries/${row.id}`;
            const deliveryLines = lines.filter((line) => line.delivery_id === row.id);
            return { id: row.id, label: row.delivery_number, className: row.execution_state === "CANCELLED" ? "row-muted" : undefined,
              cells: <>
                <td className="mono" data-label="Mã phiếu"><Link className="code-link" href={href} tabIndex={-1}>{row.delivery_number}</Link></td>
                <td className="row-title" data-label="Khách / công trình"><Link className="code-link row-link" href={href}>{row.customer_name_snapshot}</Link><small className="table-subline">{row.site_name_snapshot}</small></td>
                <td data-label="Lịch">{row.scheduled_at ? formatBusinessDateTime(row.scheduled_at) : "Chưa hẹn"}</td>
                <td data-label="Người/xe">{who(row)}</td>
                <td data-label="Kết quả">{row.result_kind ? deliveryStateLabel(row.result_kind) : "Chưa có"}</td>
                <td data-label="Trạng thái"><StatusBadge tone={deliveryStateTone(row.execution_state)}>{deliveryStateLabel(row.execution_state)}</StatusBadge></td>
              </>,
              detail: <div className="row-expansion-grid">
                <section><h3>Hàng trên phiếu</h3>{deliveryLines.length ? <ul className="clean-list">{deliveryLines.map((line) => <li key={line.id}>
                  {line.material_name_snapshot} · {formatQuantity(line.planned_base_quantity)} {line.base_uom_symbol}{line.actual_base_quantity != null && <small>Thực giao {formatQuantity(line.actual_base_quantity)} {line.base_uom_symbol}</small>}</li>)}</ul>
                  : <p className="muted">Chưa có dòng hàng.</p>}</section>
                <section><h3>Giao nhận</h3><ul className="clean-list"><li>Lịch: {row.scheduled_at ? formatBusinessDateTime(row.scheduled_at) : "Chưa hẹn"}</li><li>Người/xe: {who(row)}</li></ul></section>
                <section className="row-expansion-actions"><Link className="button button-primary" href={href}>Mở phiếu giao</Link><Link className="button button-secondary" href={`/admin/orders/${row.sales_order_id}`}>Mở đơn bán</Link>
                  {row.execution_state === "PLANNED" && canCancel && <Link className="button button-danger" href={`/admin/deliveries/${row.id}/cancel`}>Hủy kế hoạch</Link>}</section>
              </div> };
          })} />
        </table>{!deliveries.length && <p className="empty-inline">{isFiltered ? "Không có phiếu giao phù hợp." : "Chưa có phiếu giao."}</p>}</div>
        <ListPager page={list.page} hasNext={hasNext} params={{ q: list.q, state: list.state }} />
      </section>
    </div>
  </div>;
}
