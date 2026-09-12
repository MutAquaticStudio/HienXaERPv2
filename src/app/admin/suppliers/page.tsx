import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SuppliersPage() {
  const access = await requireInternalPermission("suppliers.read");
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("suppliers").select("id, code, name, phone, payment_terms_days, active").eq("branch_id", access.branchId).order("name");
  if (error) throw new Error("Không thể tải nhà cung cấp.");
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Nhà cung cấp</h1><p className="lede">Danh bạ nguồn hàng tại {access.branchName}, không trộn với khách hàng.</p></div></header><section className="card"><div className="section-head"><h2>{data.length} nhà cung cấp</h2></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>Điện thoại</th><th>Điều khoản</th><th>Trạng thái</th></tr></thead><tbody>{data.map((supplier) => <tr key={supplier.id}><td><Link className="mono" href={`/admin/suppliers/${supplier.id}`}>{supplier.code}</Link></td><td>{supplier.name}</td><td>{supplier.phone ?? "Chưa có"}</td><td>{supplier.payment_terms_days} ngày</td><td><StatusBadge tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></td></tr>)}</tbody></table></div></section></>;
}
