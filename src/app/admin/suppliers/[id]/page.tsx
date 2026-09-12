import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function SupplierDetailPage({ params }: PageProps<"/admin/suppliers/[id]">) {
  const access = await requireInternalPermission("suppliers.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [supplierResult, contactsResult, payableResult] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, phone, email, tax_code, address_text, payment_terms_days, active").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("supplier_contacts").select("id, name, phone, email, role_label, active").eq("supplier_id", id).eq("active", true),
    supabase.from("payable_obligation_read").select("id, due_date, outstanding_vnd").eq("supplier_id", id).order("due_date"),
  ]);
  if (!supplierResult.data) notFound();
  const supplier = supplierResult.data;
  const payables = payableResult.data ?? [];
  const outstanding = payables.reduce((total, row) => total + BigInt(row.outstanding_vnd), BigInt(0));
  return <><header className="page-heading"><div><p className="eyebrow">Nhà cung cấp · {supplier.code}</p><h1>{supplier.name}</h1><p className="lede">{supplier.phone ?? "Chưa có điện thoại"} · {supplier.address_text ?? "Chưa có địa chỉ"}</p></div><StatusBadge tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></header><div className="two-column"><section className="card card-pad"><h2>Hồ sơ & liên hệ</h2><dl className="detail-grid"><div className="detail-item"><dt>Email</dt><dd>{supplier.email ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Mã số thuế</dt><dd>{supplier.tax_code ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Điều khoản</dt><dd>{supplier.payment_terms_days} ngày</dd></div></dl><ul className="clean-list">{(contactsResult.data ?? []).map((contact) => <li key={contact.id}><strong>{contact.name}</strong><small>{contact.role_label ?? "Đầu mối"} · {contact.phone ?? contact.email ?? "Chưa có liên hệ"}</small></li>)}</ul></section><section className="card card-pad"><h2>Phải trả</h2><strong className="metric-value">{formatVnd(vnd(outstanding))}</strong><p className="muted">{payables.length} khoản đang ghi nhận. Lịch sử đơn mua mở ở R5; thanh toán mở ở R7.</p></section></div></>;
}
