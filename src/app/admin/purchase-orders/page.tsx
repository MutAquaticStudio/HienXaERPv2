import { formatBusinessDate } from "@/lib/core/business-time";
import { applyDocumentListScope } from "@/lib/document-list-scope";
import Link from "next/link";
import { ActionNotice } from "@/components/sales/action-notice";
import { ButtonLink } from "@/components/ui/button-link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";

type PurchaseOrder = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd?: string | null; created_at: string };
type Query = { notice?: string; error?: string; q?: string; state?: string; page?: string };

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("purchasing.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const canReadPrice = access.permissions.has("purchasing.price.read");
  const fields = `id, purchase_order_number, supplier_name_snapshot, destination_type, destination_name_snapshot, source_sales_order_id, state, expected_at, created_at${canReadPrice ? ", total_cost_vnd::text" : ""}`;
  const supabase = await createServerSupabase();
  let request = supabase.from("purchase_order_read").select(fields, { count: "exact" }).eq("branch_id", access.branchId);
  if (list.q) request = request.or(`purchase_order_number.ilike.${ilikePattern(list.q)},supplier_name_snapshot.ilike.${ilikePattern(list.q)},destination_name_snapshot.ilike.${ilikePattern(list.q)}`);
  request = applyDocumentListScope(request, "state", list.state);
  const { data, error, count } = await request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(list.from, list.to);
  if (error) throw new Error("Không thể tải đơn mua.");
  const rows = data as unknown as PurchaseOrder[];
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Đơn mua</h1><p className="lede">Nguồn hàng giữ liên kết về nhu cầu bán, không tạo nhập/xuất kho giả.</p></div>{access.permissions.has("purchasing.create") && <ButtonLink href="/admin/purchase-orders/new">Tạo đơn mua</ButtonLink>}<Link className="button button-secondary" href="/admin/purchases/returns">Trả nhà cung cấp</Link></header><ActionNotice notice={query.notice} error={query.error} />
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã đơn mua, NCC, điểm đến" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Đang làm việc (trừ đã hủy)</option><option value="ALL">Tất cả, gồm lịch sử hủy</option><option value="DRAFT">Nháp</option><option value="CONFIRMED">Đã xác nhận</option><option value="CLOSED">Đã hoàn tất</option><option value="CANCELLED">Đã hủy</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state) && <Link className="code-link" href="/admin/purchase-orders">Xóa lọc</Link>}</form>
    <section className="card"><div className="section-head"><h2>{count ?? 0} đơn mua</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã đơn mua</th><th>Nhà cung cấp</th><th>Điểm đến</th><th>Giá trị</th><th>Dự kiến</th><th>Trạng thái</th><th>Nguồn</th></tr></thead><tbody>{rows.map((order) => <tr key={order.id}><td><Link className="mono code-link" href={`/admin/purchase-orders/${order.id}`}>{order.purchase_order_number}</Link></td><td>{order.supplier_name_snapshot}</td><td>{purchaseStateLabel(order.destination_type)}<small className="table-subline">{order.destination_name_snapshot}</small></td><td className="mono">{canReadPrice && order.total_cost_vnd != null ? formatVnd(vnd(order.total_cost_vnd)) : "Không có quyền xem"}</td><td>{order.expected_at ? formatBusinessDate(order.expected_at) : "Chưa hẹn"}</td><td><StatusBadge tone={purchaseStateTone(order.state)}>{purchaseStateLabel(order.state)}</StatusBadge></td><td>{order.source_sales_order_id ? "Từ đơn bán" : "Mua về kho"}</td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Không có đơn mua phù hợp.</p>}</div><ListPager page={list.page} total={count ?? 0} params={{ q: list.q, state: list.state }} /></section></>;
}
