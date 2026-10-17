import Decimal from "decimal.js";
import Link from "next/link";
import { OpenStockCountButton } from "@/components/inventory/open-stock-count-button";
import { ActionNotice } from "@/components/sales/action-notice";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { ilikePattern, parseCoreListQuery } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { stockCountStateLabel, stockCountTone } from "@/modules/inventory/presentation";

type Count = { id: string; warehouse_id: string; count_number: string; state: string; cutoff_at: string; line_count: number; variance_count: number };
type Line = { stock_count_id: string; expected_base_quantity: string; counted_base_quantity: string };
const STATES = ["OPEN", "APPROVED", "CANCELLED"] as const;

/** Count list (FB2 Đợt 5): one row per count with how many materials were counted and went up or down. */
export default async function StockCountsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; q?: string; state?: string; page?: string; warehouse?: string }> }) {
  const access = await requireInternalPermission("inventory.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const state = (STATES as readonly string[]).includes(list.state) ? list.state : "";
  const warehouse = /^[0-9a-f-]{36}$/i.test(query.warehouse ?? "") ? query.warehouse! : "";
  const supabase = await createServerSupabase();
  let request = supabase.from("stock_count_read").select("id, warehouse_id, count_number, state, cutoff_at, line_count, variance_count", { count: "exact" }).eq("branch_id", access.branchId);
  if (state) request = request.eq("state", state);
  if (warehouse) request = request.eq("warehouse_id", warehouse);
  if (list.q) request = request.ilike("count_number", ilikePattern(list.q));
  const [countResult, warehouseResult] = await Promise.all([
    request.order("cutoff_at", { ascending: false }).order("id").range(list.from, list.to),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
  ]);
  const counts = (countResult.data ?? []) as Count[];
  const lineResult = counts.length ? await supabase.from("stock_count_line_read").select("stock_count_id, expected_base_quantity, counted_base_quantity").in("stock_count_id", counts.map((row) => row.id)).limit(5000) : { data: [] };
  const lines = (lineResult.data ?? []) as Line[];
  const direction = (countId: string, up: boolean) => lines.filter((line) => {
    const variance = new Decimal(line.counted_base_quantity).minus(line.expected_base_quantity);
    return line.stock_count_id === countId && (up ? variance.gt(0) : variance.lt(0));
  }).length;
  const warehouses = new Map((warehouseResult.data ?? []).map((row) => [row.id, row.name]));
  const filtered = Boolean(list.q || state || warehouse);

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Kho hàng</p><h1>Kiểm kho</h1><p className="lede">Đếm thực tế, xem chênh lệch và cân bằng kho. Mỗi phiếu chỉ điều chỉnh các vật tư đã đếm.</p></div>
      <div className="action-cluster">{access.permissions.has("inventory.count") && <OpenStockCountButton warehouses={[...warehouses].map(([id, name]) => ({ id, name }))} defaultWarehouseId={warehouse || undefined} />}
        <Link className="button button-secondary" href="/admin/inventory">Tồn kho</Link></div>
    </header>
    <ActionNotice notice={query.notice} error={query.error} />
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc phiếu kiểm">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã phiếu" /></label>
        <label>Kho<select name="warehouse" defaultValue={warehouse}><option value="">Tất cả kho</option>{[...warehouses].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label>Trạng thái<select name="state" defaultValue={state}><option value="">Tất cả</option>{STATES.map((value) => <option key={value} value={value}>{stockCountStateLabel(value)}</option>)}</select></label>
        {filtered && <Link className="code-link" href="/admin/stock-counts">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{countResult.count ?? 0} phiếu kiểm</h2></div>
        <div className="table-wrap"><table className="row-link-table">
          <thead><tr><th scope="col">Mã phiếu</th><th scope="col">Kho</th><th scope="col">Chốt sổ lúc</th><th scope="col" className="numeric">Đã đếm</th><th scope="col" className="numeric">Lệch tăng</th><th scope="col" className="numeric">Lệch giảm</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{counts.map((row) => <tr key={row.id}>
            <td data-label="Mã phiếu"><Link className="code-link mono row-link" href={`/admin/stock-counts/${row.id}`}>{row.count_number}</Link></td>
            <td data-label="Kho">{warehouses.get(row.warehouse_id) ?? "Kho"}</td>
            <td data-label="Chốt sổ lúc">{formatBusinessDateTime(row.cutoff_at)}</td>
            <td className="numeric" data-label="Đã đếm">{row.line_count}</td>
            <td className="numeric" data-label="Lệch tăng">{direction(row.id, true) || "—"}</td>
            <td className="numeric" data-label="Lệch giảm">{direction(row.id, false) || "—"}</td>
            <td data-label="Trạng thái"><StatusBadge tone={stockCountTone(row.state)}>{stockCountStateLabel(row.state)}</StatusBadge></td>
          </tr>)}</tbody>
        </table>{!counts.length && <p className="empty-inline">{filtered ? "Không có phiếu kiểm phù hợp." : "Chưa có phiếu kiểm. Bấm “+ Tạo phiếu kiểm” để bắt đầu."}</p>}</div>
        <ListPager page={list.page} total={countResult.count ?? 0} params={{ q: list.q || undefined, state: state || undefined, warehouse: warehouse || undefined }} />
      </section>
    </div>
  </div>;
}
