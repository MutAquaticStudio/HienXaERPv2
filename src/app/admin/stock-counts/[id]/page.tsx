import { formatQuantity } from "@/lib/core/quantity";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { approveStockCountAction, recordStockCountLineAction } from "@/modules/inventory/actions";
import { stockCountStateLabel } from "@/modules/inventory/presentation";

type Count = { id: string; warehouse_id: string; count_number: string; state: string; cutoff_at: string; version: number; line_count: number; variance_count: number };
type CountLine = { id: string; material_id: string; expected_base_quantity: string; counted_base_quantity: string; reason: string | null };

export default async function StockCountDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("inventory.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [countResult, lineResult, materialResult, warehouseResult] = await Promise.all([
    supabase.from("stock_count_read").select("id, warehouse_id, count_number, state, cutoff_at, version, line_count, variance_count").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("stock_count_lines").select("id, material_id, expected_base_quantity, counted_base_quantity, reason").eq("stock_count_id", id).order("recorded_at"),
    supabase.from("materials").select("id, name").eq("active", true).order("name"),
    supabase.from("warehouses").select("id, name").eq("branch_id", access.branchId),
  ]);
  if (!countResult.data) notFound();
  const count = countResult.data as Count;
  const lines = (lineResult.data ?? []) as CountLine[];
  const materials = new Map((materialResult.data ?? []).map((row) => [row.id, row.name]));
  const warehouses = new Map((warehouseResult.data ?? []).map((row) => [row.id, row.name]));
  const query = await searchParams;
  return <>
    <header className="page-heading"><div><p className="eyebrow">Đợt kiểm kho</p><h1>{count.count_number}</h1><p className="lede">{warehouses.get(count.warehouse_id)} · thời điểm chốt {formatBusinessDateTime(count.cutoff_at)}</p></div><ButtonLink href="/admin/stock-counts" variant="secondary">Về danh sách</ButtonLink></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <section className="axis-grid"><article className="card axis-card"><span>Trạng thái</span><StatusBadge tone={count.state === "APPROVED" ? "success" : "warning"}>{stockCountStateLabel(count.state)}</StatusBadge></article><article className="card axis-card"><span>Dòng đã đếm</span><strong>{count.line_count}</strong></article><article className="card axis-card"><span>Có chênh lệch</span><strong>{count.variance_count}</strong></article></section>
    <div className="two-column"><section className="card"><div className="section-head"><h2>Kết quả vật lý</h2></div><div className="table-wrap"><table><thead><tr><th>Vật tư</th><th>Theo sổ tại thời điểm chốt</th><th>Thực đếm</th><th>Lý do</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td>{materials.get(line.material_id)}</td><td className="mono">{formatQuantity(String(line.expected_base_quantity))}</td><td className="mono">{formatQuantity(String(line.counted_base_quantity))}</td><td>{line.reason ?? "Khớp"}</td></tr>)}</tbody></table>{lines.length === 0 && <p className="empty-inline">Chưa ghi số đếm.</p>}</div></section><aside className="card card-pad command-panel"><h2>Hành động tiếp theo</h2>{count.state === "OPEN" && access.permissions.has("inventory.count") && <form className="command-panel" action={recordStockCountLineAction}><input type="hidden" name="stockCountId" value={count.id} /><input type="hidden" name="version" value={count.version} /><input type="hidden" name="operationId" value={randomUUID()} /><div className="field"><label htmlFor="materialId">Vật tư</label><select id="materialId" name="materialId" required><option value="">Chọn vật tư</option>{[...materials].map(([materialId, name]) => <option value={materialId} key={materialId}>{name}</option>)}</select></div><div className="field"><label htmlFor="quantity">Số thực đếm theo đơn vị cơ sở</label><input id="quantity" name="quantity" inputMode="decimal" required /></div><div className="field"><label htmlFor="unitCost">Giá vốn mỗi đơn vị cơ sở khi tăng tồn</label><input id="unitCost" name="unitCost" inputMode="numeric" /></div><div className="field"><label htmlFor="reason">Lý do chênh lệch</label><textarea id="reason" name="reason" /></div><button className="button button-secondary action-full" type="submit">Ghi số đếm</button></form>}{count.state === "OPEN" && lines.length > 0 && access.permissions.has("inventory.adjust") && <form action={approveStockCountAction}><input type="hidden" name="stockCountId" value={count.id} /><input type="hidden" name="version" value={count.version} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Duyệt và ghi điều chỉnh tồn</button></form>}{count.state === "APPROVED" && <p className="muted">Đã khóa. Mọi điều chỉnh tiếp theo phải qua một đợt kiểm mới.</p>}</aside></div>
  </>;
}
