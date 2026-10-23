import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatBusinessDate } from "@/lib/core/business-time";
import { SupplierReturnCompleteForm, type ReturnLine } from "@/modules/purchasing/supplier-return-complete-form";

type Row = { purchase_receipt_id: string; receipt_number: string; received_at: string; purchase_order_number: string; supplier_name: string; receipt_line_id: string;
 material_code: string; material_name: string; warehouse_name: string; uom_symbol: string; received_quantity: string; returnable_quantity: string; unit_cost_vnd: string | number };
const columns = "purchase_receipt_id, receipt_number, received_at, purchase_order_number, supplier_name, receipt_line_id, material_code, material_name, warehouse_name, uom_symbol, received_quantity, returnable_quantity, unit_cost_vnd";

/** FB10 (4.6): "Trả hàng nhập" like KiotViet — pick the goods receipt, enter what goes back in the unit it was bought in, "Hoàn thành". */
export default async function NewSupplierReturnPage({ searchParams }: { searchParams: Promise<{ receipt?: string; q?: string }> }) {
 const access = await requireInternalAccess(), query = await searchParams, db = await createServerSupabase();
 if (!access.permissions.has("purchasing.create")) return <p>Bạn cần quyền mua hàng để trả hàng nhập.</p>;
 const receiptId = /^[0-9a-f-]{36}$/i.test(query.receipt ?? "") ? query.receipt! : null;
 const heading = <header className="page-heading"><div><p className="eyebrow"><Link href="/admin/purchases/returns">Trả hàng nhập</Link></p><h1>Tạo phiếu trả hàng nhập</h1>
  <p className="lede">Chọn phiếu nhập, nhập số lượng trả theo đơn vị đã mua rồi bấm Hoàn thành. Hàng xuất khỏi kho và công nợ nhà cung cấp giảm ngay.</p></div></header>;

 if (!receiptId) {
  let request = db.from("supplier_return_receipt_line_read").select(columns).eq("branch_id", access.branchId).eq("returnable", true).order("received_at", { ascending: false }).limit(300);
  const q = (query.q ?? "").trim().replace(/[%,()]/g, " ").slice(0, 60);
  if (q) request = request.or(`supplier_name.ilike.%${q}%,receipt_number.ilike.%${q}%,purchase_order_number.ilike.%${q}%,material_name.ilike.%${q}%`);
  const { data, error } = await request;
  if (error) throw new Error("Không thể tải phiếu nhập.");
  const receipts = new Map<string, { row: Row; items: string[] }>();
  for (const row of (data ?? []) as Row[]) { const entry = receipts.get(row.purchase_receipt_id) ?? { row, items: [] }; entry.items.push(row.material_name); receipts.set(row.purchase_receipt_id, entry); }
  return <>{heading}
   <section className="card"><div className="section-head"><h2>Chọn phiếu nhập hàng</h2>
    <form className="filter-bar" action="/admin/purchases/returns/new"><input name="q" defaultValue={q} placeholder="Tìm NCC, mã phiếu nhập, đơn mua, hàng" aria-label="Tìm phiếu nhập" /><button className="button button-secondary" type="submit">Tìm</button></form></div>
    <div className="table-wrap"><table><thead><tr><th>Phiếu nhập</th><th>Ngày nhập</th><th>Nhà cung cấp</th><th>Hàng hóa</th><th /></tr></thead><tbody>
     {[...receipts.values()].map(({ row, items }) => <tr key={row.purchase_receipt_id}>
      <td><Link className="code-link" href={`/admin/purchases/returns/new?receipt=${row.purchase_receipt_id}`}>{row.receipt_number}</Link><small className="table-subline">{row.purchase_order_number}</small></td>
      <td>{formatBusinessDate(row.received_at)}</td><td>{row.supplier_name}</td><td>{items.slice(0, 3).join(", ")}{items.length > 3 ? ` +${items.length - 3}` : ""}</td>
      <td><Link className="button button-secondary" href={`/admin/purchases/returns/new?receipt=${row.purchase_receipt_id}`}>Chọn</Link></td></tr>)}
     {!receipts.size && <tr><td colSpan={5} className="muted">Không có phiếu nhập còn hàng để trả.</td></tr>}
    </tbody></table></div></section></>;
 }

 const canRefund = access.permissions.has("finance.payment.post");
 const [lines, accounts] = await Promise.all([
  db.from("supplier_return_receipt_line_read").select(columns).eq("branch_id", access.branchId).eq("purchase_receipt_id", receiptId).order("material_name"),
  canRefund ? db.from("finance_accounts").select("id, code, name").eq("branch_id", access.branchId).eq("active", true).order("code").limit(100) : Promise.resolve({ data: [], error: null }),
 ]);
 if (lines.error || accounts.error) throw new Error("Không thể tải phiếu nhập.");
 const rows = (lines.data ?? []) as Row[];
 if (!rows.length) return <>{heading}<p className="form-message">Không tìm thấy phiếu nhập này. <Link href="/admin/purchases/returns/new">Chọn phiếu khác</Link></p></>;
 const first = rows[0];
 const returnLines: ReturnLine[] = rows.map(row => ({ id: row.receipt_line_id, materialCode: row.material_code, materialName: row.material_name, unit: row.uom_symbol,
  received: row.received_quantity, returnable: row.returnable_quantity, unitCost: String(row.unit_cost_vnd), warehouse: row.warehouse_name }));
 return <>{heading}
  <section className="card card-pad"><dl className="detail-grid">
   <div><dt>Nhà cung cấp</dt><dd><strong>{first.supplier_name}</strong></dd></div>
   <div><dt>Phiếu nhập</dt><dd>{first.receipt_number} · {formatBusinessDate(first.received_at)}</dd></div>
   <div><dt>Đơn mua</dt><dd>{first.purchase_order_number}</dd></div>
   <div><dt>Đổi phiếu</dt><dd><Link className="code-link" href="/admin/purchases/returns/new">Chọn phiếu nhập khác</Link></dd></div>
  </dl></section>
  <SupplierReturnCompleteForm receiptId={receiptId} operationId={randomUUID()} lines={returnLines} canRefund={canRefund}
   accounts={(accounts.data ?? []).map(account => ({ id: account.id, label: `${account.name} (${account.code})` }))} />
 </>;
}
