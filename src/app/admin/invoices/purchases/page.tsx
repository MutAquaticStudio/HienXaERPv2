import Link from "next/link";
import { InvoiceCommand } from "@/components/invoicing/invoice-command";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function PurchaseInvoiceRegistryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: rawPage } = await searchParams;
  const access = await requireInternalPermission("finance.ap.read");
  const page = Math.max(1, Math.min(10000, Number.parseInt(rawPage ?? "1", 10) || 1));
  const supabase = await createServerSupabase();
  const [{ data, error, count }, { data: eligible, error: eligibleError }] = await Promise.all([
    supabase.from("purchase_invoice_registry").select("id,supplier_name_snapshot,source_type,source_id,source_amount_vnd,supplier_document_number,supplier_document_date,document_state,evidence_object_id,created_at", { count: "exact" }).eq("branch_id", access.branchId).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 25, page * 25 - 1),
    supabase.rpc("purchase_invoice_eligible_sources", { target_branch_id: access.branchId, page_size: 25 }),
  ]);
  if (error || eligibleError) throw error ?? eligibleError;
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Tài chính · mua hàng</p><h1>Sổ chứng từ nhà cung cấp</h1><p className="lede">Ghi nguồn AP và evidence đã có. Không xác nhận tính hợp lệ pháp lý hay tự khai thuế.</p></div><Link className="button button-secondary" href="/admin/invoices">Hồ sơ bán</Link></header>
    <section className="card card-pad"><h2>Đã ghi nguồn</h2><div className="table-wrap"><table><thead><tr><th>Nhà cung cấp</th><th>Nguồn</th><th>Giá trị</th><th>Tham chiếu</th><th>Chứng từ</th></tr></thead><tbody>{(data ?? []).map((row) => <tr key={row.id}><td>{row.supplier_name_snapshot}</td><td>{row.source_type} · {row.source_id.slice(0, 8)}</td><td>{Number(row.source_amount_vnd).toLocaleString("vi-VN")} ₫</td><td>{row.supplier_document_number ?? "Chưa có"}</td><td>{row.document_state === "PENDING_DOCUMENT" ? "Chờ chứng từ" : "Evidence nguồn đã gắn · chưa xác thực pháp lý"}</td></tr>)}</tbody></table></div>{!data?.length && <p className="empty-inline">Chưa ghi chứng từ nguồn.</p>}<nav className="list-pagination"><span>{count ?? 0} bản ghi · trang {page}</span>{page > 1 && <Link className="button button-secondary" href={`?page=${page - 1}`}>Trang trước</Link>}{page * 25 < (count ?? 0) && <Link className="button button-secondary" href={`?page=${page + 1}`}>Trang sau</Link>}</nav></section>
    <section className="card card-pad"><h2>Nguồn AP chưa ghi sổ</h2><div className="table-wrap"><table><thead><tr><th>Nhà cung cấp</th><th>Nguồn</th><th>Giá trị nguồn</th><th>Thao tác</th></tr></thead><tbody>{(eligible ?? []).map((row: { obligation_id: string; supplier_name: string; source_type: string; source_id: string; source_amount_vnd: number }) => <tr key={row.obligation_id}><td>{row.supplier_name}</td><td>{row.source_type} · {row.source_id.slice(0, 8)}</td><td>{Number(row.source_amount_vnd).toLocaleString("vi-VN")} ₫</td><td>{access.permissions.has("finance.ap.adjust") ? <InvoiceCommand kind="purchase" sourceId={row.obligation_id} /> : "Không có quyền ghi nguồn"}</td></tr>)}</tbody></table></div>{!eligible?.length && <p className="empty-inline">Không có nguồn mua đủ điều kiện trong trang hiện tại.</p>}</section>
  </div>;
}
