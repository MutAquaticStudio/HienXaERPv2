import Link from "next/link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { createServerSupabase } from "@/lib/supabase/server";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";

type SupplierRow = { id: string; code: string; name: string; phone: string | null; payment_terms_days: number; active: boolean };
type Query = { q?: string; state?: string; page?: string };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("suppliers.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const supabase = await createServerSupabase();
  let request = supabase.from("suppliers").select("id, code, name, phone, payment_terms_days, active", { count: "exact" }).eq("branch_id", access.branchId);
  if (list.q) request = request.or(`code.ilike.${ilikePattern(list.q)},name.ilike.${ilikePattern(list.q)},phone.ilike.${ilikePattern(list.q)}`);
  if (list.state === "ACTIVE") request = request.eq("active", true);
  if (list.state === "INACTIVE") request = request.eq("active", false);
  const { data, error, count } = await request.order("name").order("id").range(list.from, list.to);
  if (error) throw new Error("Không thể tải nhà cung cấp.");
  const rows = data as SupplierRow[];
  return <><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Nhà cung cấp</h1>{access.permissions.has("suppliers.manage") && <Link className="button button-secondary" href="/admin/suppliers/manage?kind=suppliers">Thêm / sửa nhà cung cấp</Link>}{(access.permissions.has("purchasing.price.read") || access.permissions.has("purchasing.price.manage")) && <Link className="button button-secondary" href="/admin/suppliers/pricing">Bảng giá mua</Link>}<p className="lede">Danh bạ nguồn hàng tại {access.branchName}, không trộn với khách hàng.</p></div></header>
    <AutoFilterForm><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã, tên, điện thoại" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng giao dịch</option></select></label>{(list.q || list.state) && <Link className="code-link" href="/admin/suppliers">Xóa lọc</Link>}</AutoFilterForm>
    <section className="card"><div className="section-head"><h2>{count ?? 0} nhà cung cấp</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>Điện thoại</th><th>Điều khoản</th><th>Trạng thái</th></tr></thead><tbody>{rows.map((supplier) => <tr key={supplier.id}><td><Link className="mono code-link" href={`/admin/suppliers/${supplier.id}`}>{supplier.code}</Link></td><td>{supplier.name}</td><td>{supplier.phone ?? "Chưa có"}</td><td>{supplier.payment_terms_days} ngày</td><td><StatusBadge tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></td></tr>)}</tbody></table>{!rows.length && <p className="empty-inline">Không có nhà cung cấp phù hợp.</p>}</div><ListPager page={list.page} total={count ?? 0} params={{ q: list.q, state: list.state }} /></section></>;
}
