import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { openStockCountAction } from "@/modules/inventory/actions";
import { stockCountStateLabel } from "@/modules/inventory/presentation";

type Count = { id: string; warehouse_id: string; count_number: string; state: string; cutoff_at: string; line_count: number; variance_count: number };

export default async function StockCountsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("inventory.read");
  const supabase = await createServerSupabase();
  const [countResult, warehouseResult] = await Promise.all([
    supabase.from("stock_count_read").select("id, warehouse_id, count_number, state, cutoff_at, line_count, variance_count").eq("branch_id", access.branchId).order("cutoff_at", { ascending: false }),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId).eq("active", true).order("name"),
  ]);
  const warehouses = new Map((warehouseResult.data ?? []).map((row) => [row.id, row.name]));
  const counts = (countResult.data ?? []) as Count[];
  const query = await searchParams;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Đối chiếu tồn</p><h1>Kiểm kho</h1><p className="lede">Chênh lệch được duyệt thành movement mới; không sửa balance lịch sử.</p></div></header>
    <ActionNotice notice={query.notice} error={query.error} />
    {access.permissions.has("inventory.count") && <form className="card card-pad inline-create" action={openStockCountAction}><div className="field"><label htmlFor="warehouseId">Mở đợt kiểm tại kho</label><select id="warehouseId" name="warehouseId" required><option value="">Chọn kho</option>{[...warehouses].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div><input type="hidden" name="cutoffAt" value={new Date().toISOString()} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary" type="submit">Tạo đợt kiểm</button></form>}
    <section className="card"><div className="section-head"><h2>Các đợt kiểm</h2><StatusBadge tone="info">{counts.length}</StatusBadge></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Kho</th><th>Cutoff</th><th>Dòng</th><th>Chênh lệch</th><th>Trạng thái</th></tr></thead><tbody>{counts.map((row) => <tr key={row.id}><td><Link className="code-link mono" href={`/admin/stock-counts/${row.id}`}>{row.count_number}</Link></td><td>{warehouses.get(row.warehouse_id)}</td><td>{new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(row.cutoff_at))}</td><td>{row.line_count}</td><td>{row.variance_count}</td><td><StatusBadge tone={row.state === "APPROVED" ? "success" : "warning"}>{stockCountStateLabel(row.state)}</StatusBadge></td></tr>)}</tbody></table>{counts.length === 0 && <p className="empty-inline">Chưa có đợt kiểm kho.</p>}</div></section>
  </>;
}
