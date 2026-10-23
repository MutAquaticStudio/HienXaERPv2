import { formatBusinessDate, formatBusinessDateTime } from "@/lib/core/business-time";
import { applyDocumentListScope } from "@/lib/document-list-scope";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { ExpandableRows } from "@/components/lists/expandable-rows";
import { ListFilterGroup, countText } from "@/components/lists/list-filter-group";
import { requireInternalPermission } from "@/lib/access/context";
import { parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import { createServerSupabase } from "@/lib/supabase/server";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";

type PurchaseOrder = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd?: string | null; created_at: string };
type PurchaseLine = { purchase_order_id: string; id: string; material_name_snapshot: string; quantity: string; ordered_uom_id: string; line_total_cost_vnd?: string | null };
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string };

const STATES = [
  { value: "", label: "Đang làm việc" },
  { value: "DRAFT", label: "Chờ nhận hàng" },
  { value: "CONFIRMED", label: "Đang nhận hàng" },
  { value: "CLOSED", label: "Đã hoàn tất" },
  { value: "CANCELLED", label: "Đã hủy" },
  { value: "ALL", label: "Tất cả" },
] as const;

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("purchasing.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const canReadPrice = access.permissions.has("purchasing.price.read");
  const fields = `id, purchase_order_number, supplier_name_snapshot, destination_type, destination_name_snapshot, source_sales_order_id, state, expected_at, created_at${canReadPrice ? ", total_cost_vnd::text" : ""}`;
  const supabase = await createServerSupabase();
  const scoped = (state: string, select: string, count?: "exact") => {
    let request = supabase.from("purchase_order_read").select(select, count ? { count } : undefined).eq("branch_id", access.branchId);
    if (list.q) request = request.or(`purchase_order_number.ilike.${ilikePattern(list.q)},supplier_name_snapshot.ilike.${ilikePattern(list.q)},destination_name_snapshot.ilike.${ilikePattern(list.q)}`);
    return applyDocumentListScope(request, "state", state);
  };
  const [{ data, error, count }, ...counts] = await Promise.all([
    scoped(list.state, fields, "exact").order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to),
    ...STATES.map((state) => scoped(state.value, "id").limit(100)),
  ]);
  if (error) throw new Error("Không thể tải đơn mua.");
  const rows = data as unknown as PurchaseOrder[];
  const ids = rows.map((order) => order.id);
  // D17: when each confirmed purchase order was last sent to its supplier.
  const confirmedIds = rows.filter((order) => order.state === "CONFIRMED").map((order) => order.id);
  const [{ data: sentRows }, { data: lineData }, { data: uoms }] = await Promise.all([
    confirmedIds.length ? supabase.from("purchase_order_dispatches").select("purchase_order_id, channel, sent_at").in("purchase_order_id", confirmedIds).order("sent_at", { ascending: false }) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("purchase_order_line_read").select(`purchase_order_id, id, material_name_snapshot, quantity, ordered_uom_id${canReadPrice ? ", line_total_cost_vnd::text" : ""}`).in("purchase_order_id", ids).order("line_number").limit(500) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("units_of_measure").select("id, symbol") : Promise.resolve({ data: [] }),
  ]);
  const lastSent = new Map<string, { channel: string; sent_at: string }>();
  for (const row of (sentRows ?? []) as { purchase_order_id: string; channel: string; sent_at: string }[]) if (!lastSent.has(row.purchase_order_id)) lastSent.set(row.purchase_order_id, row);
  const lines = (lineData ?? []) as unknown as PurchaseLine[];
  const symbols = new Map(((uoms ?? []) as { id: string; symbol: string }[]).map((row) => [row.id, row.symbol]));
  const sentText = (order: PurchaseOrder) => {
    const sent = lastSent.get(order.id);
    if (order.state !== "CONFIRMED") return <span className="muted">—</span>;
    return sent ? <span>Đã gửi {formatBusinessDateTime(sent.sent_at)} · {sent.channel === "ZALO" ? "Zalo" : sent.channel === "EMAIL" ? "Email" : "Khác"}</span> : <StatusBadge tone="warning">Chưa gửi</StatusBadge>;
  };
  const isFiltered = Boolean(list.q || list.state);
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Mua hàng</p><h1>Đơn mua</h1><p className="lede">Nguồn hàng giữ liên kết về nhu cầu bán. Mũi tên để xem nhanh hàng hóa của đơn.</p></div>
      <div className="action-cluster"><Link className="button button-secondary" href="/admin/purchases/returns">Trả hàng nhập</Link>{access.permissions.has("purchasing.create") && <ButtonLink href="/admin/purchase-orders/new">+ Tạo đơn mua</ButtonLink>}</div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc đơn mua">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã đơn mua, NCC, điểm đến" /></label>
        <ListFilterGroup key={list.state} legend="Trạng thái" name="state" value={list.state} options={STATES.map((state, index) => ({ ...state, count: countText(counts[index].data) }))} />
        {isFiltered && <Link className="code-link" href="/admin/purchase-orders">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{count ?? 0} đơn mua</h2><span className="scope-chip">25 / trang</span></div>
        <div className="table-wrap"><table className="row-link-table">
          <thead><tr><th><span className="sr-only">Xem nhanh</span></th><th>Mã đơn mua</th><th>Nhà cung cấp</th><th>Điểm đến</th><th className="numeric">Giá trị</th><th>Dự kiến</th><th>Trạng thái</th><th>Gửi NCC</th></tr></thead>
          <ExpandableRows columns={8} rows={rows.map((order) => {
            const href = `/admin/purchase-orders/${order.id}`;
            const orderLines = lines.filter((line) => line.purchase_order_id === order.id);
            return { id: order.id, label: order.purchase_order_number, className: order.state === "CANCELLED" ? "row-muted" : undefined,
              cells: <>
                <td className="mono" data-label="Mã đơn mua"><Link className="code-link" href={href} tabIndex={-1}>{order.purchase_order_number}</Link></td>
                <td className="row-title" data-label="Nhà cung cấp"><Link className="code-link row-link" href={href}>{order.supplier_name_snapshot}</Link><small className="table-subline">{order.source_sales_order_id ? "Từ đơn bán" : "Mua về kho"}</small></td>
                <td data-label="Điểm đến">{purchaseStateLabel(order.destination_type)}<small className="table-subline">{order.destination_name_snapshot}</small></td>
                <td className="numeric mono" data-label="Giá trị">{canReadPrice && order.total_cost_vnd != null ? formatVnd(vnd(order.total_cost_vnd)) : "—"}</td>
                <td data-label="Dự kiến">{order.expected_at ? formatBusinessDate(order.expected_at) : "Chưa hẹn"}</td>
                <td data-label="Trạng thái"><StatusBadge tone={purchaseStateTone(order.state)}>{purchaseStateLabel(order.state)}</StatusBadge></td>
                <td data-label="Gửi NCC">{sentText(order)}</td>
              </>,
              detail: <div className="row-expansion-grid">
                <section><h3>Hàng hóa</h3>{orderLines.length ? <ul className="clean-list">{orderLines.map((line) => <li key={line.id}>
                  {line.material_name_snapshot} · {formatQuantity(line.quantity)} {symbols.get(line.ordered_uom_id) ?? ""}{canReadPrice && line.line_total_cost_vnd != null && <small className="mono">{formatVnd(vnd(line.line_total_cost_vnd))}</small>}</li>)}</ul>
                  : <p className="muted">Chưa có dòng hàng.</p>}</section>
                <section><h3>Giao nhận</h3><ul className="clean-list"><li>{purchaseStateLabel(order.destination_type)}: {order.destination_name_snapshot}</li><li>Dự kiến: {order.expected_at ? formatBusinessDate(order.expected_at) : "Chưa hẹn"}</li><li>Gửi NCC: {sentText(order)}</li></ul></section>
                <section className="row-expansion-actions"><Link className="button button-primary" href={href}>Mở đơn mua</Link></section>
              </div> };
          })} />
        </table>{!rows.length && <p className="empty-inline">{isFiltered ? "Không có đơn mua phù hợp." : "Chưa có đơn mua trong chi nhánh này."}</p>}</div>
        <ListPager page={list.page} total={count ?? 0} params={{ q: list.q, state: list.state }} />
      </section>
    </div>
  </div>;
}
