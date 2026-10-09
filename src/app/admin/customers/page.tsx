import Link from "next/link";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";

type CustomerRow = { id: string; code: string; display_name: string; phone: string | null; tier_code: string | null; active: boolean; credit_limit_vnd?: string | number | null };
type Query = { q?: string; state?: string; page?: string };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("customers.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const canReadFinance = access.permissions.has("finance.ar.read");
  const supabase = await createServerSupabase();
  const fields = "id, code, display_name, phone, tier_code, active";
  let request = supabase.from("customers").select(fields, { count: "exact" }).eq("branch_id", access.branchId);
  if (list.q) request = request.or(`code.ilike.${ilikePattern(list.q)},display_name.ilike.${ilikePattern(list.q)},phone.ilike.${ilikePattern(list.q)}`);
  if (list.state === "ACTIVE") request = request.eq("active", true);
  if (list.state === "INACTIVE") request = request.eq("active", false);
  const { data, error, count } = await request.order("display_name").order("id").range(list.from, list.to);
  if (error) throw new Error("Không thể tải danh sách khách hàng.");
  const rows = data as unknown as CustomerRow[];
  const privateResult = canReadFinance && rows.length
    ? await supabase.rpc("customer_private_fields", { target_customer_ids: rows.map((customer) => customer.id) })
    : { data: [], error: null };
  if (privateResult.error) throw new Error("Không tải được hạn mức khách hàng.");
  const privateLimits = new Map<string, string | number | null>((privateResult.data ?? []).map((field: { customer_id: string; credit_limit_vnd: string | number | null }) => [field.customer_id, field.credit_limit_vnd] as const));
  const customers = rows.map((customer) => ({ ...customer, credit_limit_vnd: privateLimits.get(customer.id) ?? null }));
  return <><header className="page-heading"><div><p className="eyebrow">Quan hệ khách hàng</p><h1>Khách hàng</h1>{access.permissions.has("customers.manage") && <div className="form-actions"><Link className="button button-secondary" href="/admin/customers/manage?kind=customers">Thêm / sửa khách hàng</Link><Link className="button button-secondary" href="/admin/customers/manage?kind=sites">Công trình</Link></div>}<p className="lede">Hồ sơ và phạm vi tài chính được trả về đúng quyền tại {access.branchName}.</p></div></header>
    <form className="filter-bar"><label>Tìm kiếm<input name="q" defaultValue={list.q} placeholder="Mã, tên, điện thoại" /></label><label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng giao dịch</option></select></label><button className="button button-secondary" type="submit">Áp dụng</button>{(list.q || list.state) && <Link className="code-link" href="/admin/customers">Xóa lọc</Link>}</form>
    <section className="card"><div className="section-head"><h2>{count ?? 0} khách hàng</h2><span className="scope-chip">25 / trang</span></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên khách hàng</th><th>Điện thoại</th><th>Nhóm giá</th>{canReadFinance && <th>Hạn mức</th>}<th>Trạng thái</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><Link className="mono code-link" href={`/admin/customers/${customer.id}`}>{customer.code}</Link></td><td>{customer.display_name}</td><td>{customer.phone ?? "Chưa có"}</td><td>{customer.tier_code ?? "Mặc định"}</td>{canReadFinance && <td className="mono">{customer.credit_limit_vnd == null ? "Chưa duyệt" : formatVnd(vnd(customer.credit_limit_vnd.toString()))}</td>}<td><StatusBadge tone={customer.active ? "success" : "danger"}>{customer.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></td></tr>)}</tbody></table>{!customers.length && <p className="empty-inline">Không có khách hàng phù hợp.</p>}</div><ListPager page={list.page} total={count ?? 0} params={{ q: list.q, state: list.state }} /></section></>;
}
