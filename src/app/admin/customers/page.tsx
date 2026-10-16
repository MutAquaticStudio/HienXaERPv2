import Link from "next/link";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";

type CustomerRow = { id: string; code: string; display_name: string; phone: string | null; tier_code: string | null; customer_type: string; active: boolean };
type Query = { q?: string; state?: string; page?: string; tier?: string; type?: string };
const RECEIVABLE_ROW_LIMIT = 2000;

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("customers.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const tier = query.tier?.trim().slice(0, 40) || "";
  const type = query.type === "BUSINESS" || query.type === "INDIVIDUAL" ? query.type : "";
  const canReadFinance = access.permissions.has("finance.ar.read");
  const canManage = access.permissions.has("customers.manage");
  const supabase = await createServerSupabase();
  let request = supabase.from("customers").select("id, code, display_name, phone, tier_code, customer_type, active", { count: "exact" }).eq("branch_id", access.branchId);
  if (list.q) request = request.or(`code.ilike.${ilikePattern(list.q)},display_name.ilike.${ilikePattern(list.q)},phone.ilike.${ilikePattern(list.q)}`);
  if (list.state === "ACTIVE") request = request.eq("active", true);
  if (list.state === "INACTIVE") request = request.eq("active", false);
  if (tier) request = tier === "DEFAULT" ? request.is("tier_code", null) : request.eq("tier_code", tier);
  if (type) request = request.eq("customer_type", type);
  const [{ data, error, count }, tierResult] = await Promise.all([
    request.order("display_name").order("id").range(list.from, list.to),
    supabase.from("customers").select("tier_code").eq("branch_id", access.branchId).not("tier_code", "is", null).order("tier_code").limit(500),
  ]);
  if (error) throw new Error("Không thể tải danh sách khách hàng.");
  const rows = (data ?? []) as unknown as CustomerRow[];
  const tiers = [...new Set((tierResult.data ?? []).map((row) => String(row.tier_code)))];
  const ids = rows.map((row) => row.id);

  // Finance columns only for actors who may read receivables, and only for the customers on this page.
  const [limitResult, debtResult] = canReadFinance && ids.length ? await Promise.all([
    supabase.rpc("customer_private_fields", { target_customer_ids: ids }).select("customer_id,credit_limit_vnd::text"),
    supabase.from("receivable_read").select("customer_id, outstanding_amount_vnd::text").eq("branch_id", access.branchId).in("customer_id", ids).gt("outstanding_amount_vnd", 0).limit(RECEIVABLE_ROW_LIMIT),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (limitResult.error) throw new Error("Không tải được hạn mức khách hàng.");
  const limits = new Map<string, string | null>((Array.isArray(limitResult.data) ? limitResult.data : limitResult.data ? [limitResult.data] : [])
    .map((row: { customer_id: string; credit_limit_vnd: string | null }) => [row.customer_id, row.credit_limit_vnd]));
  const debtRows = (debtResult.data ?? []) as { customer_id: string; outstanding_amount_vnd: string }[];
  const debtComplete = !debtResult.error && debtRows.length < RECEIVABLE_ROW_LIMIT;
  const debts = new Map<string, bigint>();
  for (const row of debtRows) debts.set(row.customer_id, (debts.get(row.customer_id) ?? 0n) + BigInt(row.outstanding_amount_vnd));
  const filtered = Boolean(list.q || list.state || tier || type);

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Khách hàng</h1><p className="lede">Hồ sơ khách hàng tại {access.branchName}. Bấm vào một dòng để xem chi tiết.</p></div>
      {canManage && <div className="action-cluster"><Link className="button button-primary" href="/admin/customers/manage?kind=customers">+ Khách hàng</Link><Link className="button button-secondary" href="/admin/customers/manage?kind=sites">Công trình</Link></div>}
    </header>
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc khách hàng">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã, tên, điện thoại" /></label>
        <label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng giao dịch</option></select></label>
        <label>Loại khách<select name="type" defaultValue={type}><option value="">Tất cả</option><option value="BUSINESS">Doanh nghiệp</option><option value="INDIVIDUAL">Cá nhân</option></select></label>
        <label>Nhóm giá<select name="tier" defaultValue={tier}><option value="">Tất cả</option><option value="DEFAULT">Mặc định</option>{tiers.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {filtered && <Link className="code-link" href="/admin/customers">Xóa lọc</Link>}
      </AutoFilterForm>
      <section className="card list-main">
        <div className="section-head"><h2>{count ?? 0} khách hàng</h2><span className="scope-chip">25 / trang</span></div>
        <div className="table-wrap"><table className="row-link-table">
          <thead><tr><th>Mã</th><th>Tên khách hàng</th><th>Điện thoại</th><th>Nhóm giá</th>{canReadFinance && <><th className="numeric">Nợ hiện tại</th><th className="numeric">Hạn mức</th></>}<th>Trạng thái</th></tr></thead>
          <tbody>{rows.map((customer) => {
            const href = `/admin/customers/${customer.id}`;
            const limit = limits.get(customer.id);
            const debt = debts.get(customer.id) ?? 0n;
            return <tr key={customer.id}>
              <td data-label="Mã"><Link className="mono code-link" href={href} tabIndex={-1}>{customer.code}</Link></td>
              <td className="row-title" data-label="Tên khách hàng"><Link className="code-link row-link" href={href}>{customer.display_name}</Link><small className="table-subline">{customer.customer_type === "INDIVIDUAL" ? "Cá nhân" : "Doanh nghiệp"}</small></td>
              <td data-label="Điện thoại">{customer.phone ?? "Chưa có"}</td>
              <td data-label="Nhóm giá">{customer.tier_code ?? "Mặc định"}</td>
              {canReadFinance && <>
                <td className="numeric mono" data-label="Nợ hiện tại">{!debtComplete ? "—" : debt > 0n ? <strong>{formatVnd(vnd(debt.toString()))}</strong> : "0 ₫"}</td>
                <td className="numeric mono" data-label="Hạn mức">{limit == null ? "Chưa duyệt" : formatVnd(vnd(limit))}</td>
              </>}
              <td data-label="Trạng thái"><StatusBadge tone={customer.active ? "success" : "danger"}>{customer.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></td>
            </tr>;
          })}</tbody>
        </table>{!rows.length && <p className="empty-inline">Không có khách hàng phù hợp.</p>}</div>
        {canReadFinance && !debtComplete && <p className="metric-note card-pad">Chưa tải đủ công nợ để hiển thị cột “Nợ hiện tại”. Xem tại Công nợ phải thu.</p>}
        <ListPager page={list.page} total={count ?? 0} params={{ q: list.q, state: list.state, tier: tier || undefined, type: type || undefined }} />
      </section>
    </div>
  </div>;
}
