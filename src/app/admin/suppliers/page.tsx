import Link from "next/link";
import { AutoFilterForm } from "@/components/ui/auto-filter-form";
import { ListPager } from "@/components/ui/list-pager";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { parseCoreListQuery, ilikePattern } from "@/lib/core-list";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { CatalogCreateButton } from "@/modules/catalog/catalog-dialog";
import { catalogCreateProps } from "@/modules/catalog/editor-data";
import { BulkActionBar, BulkPageCheckbox, BulkRowCheckbox, BulkSelection } from "@/components/lists/bulk-selection";
import { BULK_LIMIT, type BulkFieldChoice } from "@/modules/catalog/bulk";

type SupplierRow = { id: string; code: string; name: string; phone: string | null; tax_code: string | null; payment_terms_days: number; active: boolean };
type Query = { q?: string; state?: string; page?: string };
const PAYABLE_ROW_LIMIT = 2000;

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Query> }) {
  const access = await requireInternalPermission("suppliers.read");
  const query = await searchParams;
  const list = parseCoreListQuery(query);
  const canManage = access.permissions.has("suppliers.manage");
  const canReadPayables = access.permissions.has("finance.ap.read");
  const supabase = await createServerSupabase();
  const filteredSuppliers = (columns: string, counted = false) => {
    let request = supabase.from("suppliers").select(columns, counted ? { count: "exact" } : undefined).eq("branch_id", access.branchId);
    if (list.q) request = request.or(`code.ilike.${ilikePattern(list.q)},name.ilike.${ilikePattern(list.q)},phone.ilike.${ilikePattern(list.q)}`);
    if (list.state === "ACTIVE") request = request.eq("active", true);
    if (list.state === "INACTIVE") request = request.eq("active", false);
    return request;
  };
  const { data, error, count } = await filteredSuppliers("id, code, name, phone, tax_code, payment_terms_days, active", true).order("name").order("id").range(list.from, list.to);
  if (error) throw new Error("Không thể tải nhà cung cấp.");
  const rows = (data ?? []) as unknown as SupplierRow[];
  const ids = rows.map((row) => row.id);

  // Amounts owed only for actors who may read payables, and only for the suppliers on this page.
  const debtResult = canReadPayables && ids.length
    ? await supabase.from("payable_read").select("supplier_id, outstanding_amount_vnd::text").eq("branch_id", access.branchId).in("supplier_id", ids).gt("outstanding_amount_vnd", 0).limit(PAYABLE_ROW_LIMIT)
    : { data: [], error: null };
  const debtRows = (debtResult.data ?? []) as { supplier_id: string; outstanding_amount_vnd: string }[];
  const debtComplete = !debtResult.error && debtRows.length < PAYABLE_ROW_LIMIT;
  const debts = new Map<string, bigint>();
  for (const row of debtRows) debts.set(row.supplier_id, (debts.get(row.supplier_id) ?? 0n) + BigInt(row.outstanding_amount_vnd));
  const create = canManage ? await catalogCreateProps("suppliers", access, supabase) : null;
  const filtered = Boolean(list.q || list.state);
  // Bulk changes: every supplier matching the filter can be chosen at once when there are at most 200 of them.
  const total = count ?? 0;
  const matchingResult = canManage && total > ids.length && total <= BULK_LIMIT ? await filteredSuppliers("id").order("name").order("id").limit(BULK_LIMIT) : null;
  const matchingIds = total <= ids.length ? ids : matchingResult?.data ? (matchingResult.data as unknown as { id: string }[]).map((row) => row.id) : undefined;
  const bulkFields: BulkFieldChoice[] = [{ field: "payment_terms_days", label: "Hạn thanh toán (ngày)", control: "days" }];

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Nhà cung cấp</h1><p className="lede">Danh bạ nguồn hàng tại {access.branchName}. Bấm tên nhà cung cấp để xem chi tiết.</p></div>
      <div className="action-cluster">
        {create && <CatalogCreateButton {...create} label="+ Nhà cung cấp" />}
        {(access.permissions.has("purchasing.price.read") || access.permissions.has("purchasing.price.manage")) && <Link className="button button-secondary" href="/admin/suppliers/pricing">Bảng giá mua</Link>}
      </div>
    </header>
    <div className="list-layout">
      <AutoFilterForm className="card card-pad list-filters" aria-label="Bộ lọc nhà cung cấp">
        <label className="list-filters-search">Tìm kiếm<input type="search" name="q" defaultValue={list.q} placeholder="Mã, tên, điện thoại" /></label>
        <label>Trạng thái<select name="state" defaultValue={list.state}><option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INACTIVE">Ngừng giao dịch</option></select></label>
        {filtered && <Link className="code-link" href="/admin/suppliers">Xóa lọc</Link>}
      </AutoFilterForm>
      <BulkSelection key={JSON.stringify([list.q, list.state, list.page])}><section className="card list-main">
        <div className="section-head"><h2>{count ?? 0} nhà cung cấp</h2><span className="scope-chip">25 / trang</span></div>
        {canManage && <BulkActionBar kind="suppliers" pageIds={ids} matchingIds={matchingIds} total={total} fields={bulkFields} activeLabels={{ stop: "Ngừng giao dịch", restart: "Giao dịch lại" }} />}
        <div className="table-wrap"><table className="row-link-table">
          <thead><tr>{canManage && <th className="row-select"><BulkPageCheckbox ids={ids} /></th>}<th>Mã</th><th>Nhà cung cấp</th><th>Điện thoại</th>{canReadPayables && <th className="numeric">Còn phải trả</th>}<th>Hạn thanh toán</th><th>Trạng thái</th></tr></thead>
          <tbody>{rows.map((supplier) => {
            const href = `/admin/suppliers/${supplier.id}`;
            const debt = debts.get(supplier.id) ?? 0n;
            return <tr key={supplier.id}>
              {canManage && <td className="row-select"><BulkRowCheckbox id={supplier.id} label={`${supplier.code} ${supplier.name}`} /></td>}
              <td data-label="Mã"><Link className="mono code-link" href={href} tabIndex={-1}>{supplier.code}</Link></td>
              <td className="row-title" data-label="Nhà cung cấp"><Link className="code-link row-link" href={href}>{supplier.name}</Link>{supplier.tax_code && <small className="table-subline">MST {supplier.tax_code}</small>}</td>
              <td data-label="Điện thoại">{supplier.phone ?? "Chưa có"}</td>
              {canReadPayables && <td className="numeric mono" data-label="Còn phải trả">{!debtComplete ? "—" : debt > 0n ? <strong>{formatVnd(vnd(debt.toString()))}</strong> : "0 ₫"}</td>}
              <td data-label="Hạn thanh toán">{supplier.payment_terms_days} ngày</td>
              <td data-label="Trạng thái"><StatusBadge tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></td>
            </tr>;
          })}</tbody>
        </table>{!rows.length && <p className="empty-inline">Không có nhà cung cấp phù hợp.</p>}</div>
        {canReadPayables && !debtComplete && <p className="metric-note card-pad">Chưa tải đủ công nợ để hiển thị cột “Còn phải trả”. Xem tại Công nợ phải trả.</p>}
        <ListPager page={list.page} total={count ?? 0} params={{ q: list.q, state: list.state }} />
      </section></BulkSelection>
    </div>
  </div>;
}
