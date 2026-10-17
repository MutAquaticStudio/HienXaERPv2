import { formatBusinessDate } from "@/lib/core/business-time";
import { formatQuantity } from "@/lib/core/quantity";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";
import { financeStateLabel, financeSourceLabel } from "@/modules/finance/presentation";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import Link from "next/link";
import { activeTab, DetailTabs, type DetailTab } from "@/components/ui/detail-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CatalogEditButton } from "@/modules/catalog/catalog-dialog";
import { catalogRecordProps } from "@/modules/catalog/editor-data";

type Supplier = { id: string; code: string; name: string; phone: string | null; email: string | null; tax_code: string | null; address_text: string | null; payment_terms_days: number; active: boolean };
type PurchaseRow = { id: string; purchase_order_number: string; state: string; destination_type: string; destination_name_snapshot: string; total_cost_vnd?: string; expected_at: string | null; created_at: string };
type ReceiptRow = { id: string; purchase_order_id: string; receipt_number: string; received_at: string; received_base_quantity: string };
type FulfillmentRow = { id: string; purchase_order_id: string; supplier_reference: string | null; verified_at: string; supplier_base_quantity: string };
type PayableRow = { id: string; source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; state: string; recorded_at: string };
type PaymentRow = { id: string; payment_number: string; direction: string; amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string };
type PriceRow = { id: string; material_id: string; purchase_uom_id: string; unit_cost_vnd: string; version: number; source_type: string; effective_from: string; effective_to: string | null };
type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

const date = (value: string) => formatBusinessDate(value);
const money = (value: string | bigint) => formatVnd(vnd(String(value)));

/**
 * Supplier 360 (FB2 Đợt 4): what the business owes the supplier and what is open with them, then one tab per subject.
 * Only the open tab's records are read; numbers come from the existing read views.
 */
export default async function SupplierDetailPage({ params, searchParams }: PageProps<"/admin/suppliers/[id]">) {
  const access = await requireInternalPermission("suppliers.read");
  const { id } = await params;
  const query = (await searchParams) as { tab?: string };
  const can = {
    purchasing: access.permissions.has("purchasing.read"),
    price: access.permissions.has("purchasing.price.read"),
    finance: access.permissions.has("finance.ap.read"),
    createPurchase: access.permissions.has("purchasing.create"),
    managePrice: access.permissions.has("purchasing.price.manage"),
    manage: access.permissions.has("suppliers.manage"),
  };
  const canPostPayment = can.finance && access.permissions.has("finance.payment.post");
  const supabase = await createServerSupabase();
  const [supplierResult, payableStatResult, purchaseStatResult] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, phone, email, tax_code, address_text, payment_terms_days, active").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    can.finance ? supabase.from("payable_read").select("outstanding_amount_vnd::text, state").eq("branch_id", access.branchId).eq("supplier_id", id).gt("outstanding_amount_vnd", 0).limit(2000) : Promise.resolve({ data: [], error: null }),
    can.purchasing ? supabase.from("purchase_order_read").select(`state${can.price ? ", total_cost_vnd::text" : ""}`).eq("branch_id", access.branchId).eq("supplier_id", id).limit(5000) : Promise.resolve({ data: [], error: null }),
  ]);
  if (!supplierResult.data) notFound();
  const supplier = supplierResult.data as Supplier;
  const payables = (payableStatResult.data ?? []) as unknown as { outstanding_amount_vnd: string; state: string }[];
  const owed = payables.reduce((sum, row) => sum + BigInt(row.outstanding_amount_vnd), 0n);
  const overdue = payables.filter((row) => row.state === "OVERDUE").reduce((sum, row) => sum + BigInt(row.outstanding_amount_vnd), 0n);
  const purchases = (purchaseStatResult.data ?? []) as unknown as { state: string; total_cost_vnd?: string }[];
  const totalPurchased = purchases.filter((row) => ["CONFIRMED", "CLOSED"].includes(row.state)).reduce((sum, row) => sum + BigInt(row.total_cost_vnd ?? "0"), 0n);
  const openPurchases = purchases.filter((row) => row.state === "CONFIRMED").length;

  const tabs: DetailTab[] = [
    { id: "info", label: "Thông tin & liên hệ" },
    ...(can.purchasing ? [{ id: "purchases", label: "Đơn mua", count: purchases.length }, { id: "receipts", label: "Nhập kho & giao thẳng" }] : []),
    ...(can.finance ? [{ id: "debts", label: "Công nợ & thanh toán" }] : []),
    ...(can.price || can.managePrice ? [{ id: "prices", label: "Bảng giá mua" }] : []),
  ];
  const tab = activeTab(tabs, query.tab);
  const editProps = can.manage ? await catalogRecordProps("suppliers", id, access, supabase) : null;

  // Only the open tab is read.
  const body = tab === "purchases" ? await PurchasesTab({ supplierId: id, branchId: access.branchId, supabase, showPrice: can.price })
    : tab === "receipts" ? await ReceiptsTab({ supplierId: id, branchId: access.branchId, supabase })
    : tab === "debts" ? await DebtsTab({ supplierId: id, branchId: access.branchId, supabase, canPostPayment })
    : tab === "prices" ? await PricesTab({ supplierId: id, branchId: access.branchId, supabase, canManage: can.managePrice })
    : await InfoTab({ supplier, supabase });

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Nhà cung cấp · {supplier.code}</p><h1>{supplier.name}</h1>
      <p className="lede">{supplier.phone ?? "Chưa có điện thoại"} · {supplier.address_text ?? "Chưa có địa chỉ"}{supplier.tax_code ? ` · MST ${supplier.tax_code}` : ""}</p></div>
      <div className="form-actions">
        {can.createPurchase && supplier.active && <Link className="button button-primary" href={`/admin/purchase-orders/new?supplier=${supplier.id}`}>Tạo đơn mua</Link>}
        {canPostPayment && <Link className="button button-secondary" href={`/admin/payables?supplier=${supplier.id}`}>Ghi chi</Link>}
        {editProps && <CatalogEditButton {...editProps} label="Sửa" />}
        <StatusBadge tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang giao dịch" : "Ngừng giao dịch"}</StatusBadge>
      </div>
    </header>
    <section className="metric-grid metric-grid-5" aria-label="Chỉ số nhà cung cấp">
      <article className="card metric-card"><span className="metric-label">Còn phải trả</span><strong className="metric-value">{can.finance ? money(owed) : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Quá hạn</span><strong className={`metric-value${overdue > 0n ? " text-danger" : ""}`}>{can.finance ? money(overdue) : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Tổng mua (đơn đã xác nhận)</span><strong className="metric-value">{can.purchasing && can.price ? money(totalPurchased) : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Đơn mua đang mở</span><strong className="metric-value">{can.purchasing ? openPurchases : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Điều khoản</span><strong className="metric-value">{supplier.payment_terms_days} ngày</strong></article>
    </section>
    <DetailTabs tabs={tabs} active={tab} label="Nội dung nhà cung cấp" href={(next) => `/admin/suppliers/${supplier.id}?tab=${next}`} />
    {body}
  </div>;
}

async function InfoTab({ supplier, supabase }: { supplier: Supplier; supabase: Supabase }) {
  const { data } = await supabase.from("supplier_contacts").select("id, name, phone, email, role_label").eq("supplier_id", supplier.id).eq("active", true).order("name").limit(50);
  const contacts = (data ?? []) as { id: string; name: string; phone: string | null; email: string | null; role_label: string | null }[];
  return <div className="two-column">
    <section className="card card-pad"><h2>Hồ sơ</h2><dl className="detail-grid">
      <div className="detail-item"><dt>Thư điện tử</dt><dd>{supplier.email ?? "Chưa có"}</dd></div>
      <div className="detail-item"><dt>Mã số thuế</dt><dd>{supplier.tax_code ?? "Chưa có"}</dd></div>
      <div className="detail-item"><dt>Điều khoản thanh toán</dt><dd>{supplier.payment_terms_days} ngày</dd></div>
      <div className="detail-item field-full"><dt>Địa chỉ</dt><dd>{supplier.address_text ?? "Chưa có"}</dd></div>
    </dl></section>
    <section className="card card-pad"><h2>Đầu mối liên hệ</h2>
      <ul className="clean-list">{contacts.map((contact) => <li key={contact.id}><strong>{contact.name}</strong><small>{contact.role_label ?? "Đầu mối"} · {contact.phone ?? contact.email ?? "Chưa có liên hệ"}</small></li>)}</ul>
      {!contacts.length && <p className="empty-inline">Chưa có đầu mối đang hoạt động.</p>}</section>
  </div>;
}

async function PurchasesTab({ supplierId, branchId, supabase, showPrice }: { supplierId: string; branchId: string; supabase: Supabase; showPrice: boolean }) {
  const { data } = await supabase.from("purchase_order_read").select(`id, purchase_order_number, state, destination_type, destination_name_snapshot, expected_at, created_at${showPrice ? ", total_cost_vnd::text" : ""}`)
    .eq("branch_id", branchId).eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as PurchaseRow[];
  return <section className="card list-main"><div className="section-head"><h2>Đơn mua</h2><span className="scope-chip">50 gần nhất</span></div>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Mã đơn</th><th scope="col">Nhận tại</th><th scope="col">Trạng thái</th><th scope="col">Dự kiến</th>{showPrice && <th scope="col" className="numeric">Tổng tiền</th>}<th scope="col">Ngày tạo</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td className="mono" data-label="Mã đơn"><Link className="code-link" href={`/admin/purchase-orders/${row.id}`}>{row.purchase_order_number}</Link></td>
        <td data-label="Nhận tại">{row.destination_type === "WAREHOUSE" ? "Về kho" : "Giao thẳng"}<small className="table-subline">{row.destination_name_snapshot}</small></td>
        <td data-label="Trạng thái"><StatusBadge tone={purchaseStateTone(row.state)}>{purchaseStateLabel(row.state)}</StatusBadge></td>
        <td data-label="Dự kiến">{row.expected_at ? date(row.expected_at) : "Chưa hẹn"}</td>
        {showPrice && <td className="numeric mono" data-label="Tổng tiền">{row.total_cost_vnd != null ? money(row.total_cost_vnd) : "—"}</td>}
        <td data-label="Ngày tạo">{date(row.created_at)}</td>
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có đơn mua.</p>}
  </section>;
}

async function ReceiptsTab({ supplierId, branchId, supabase }: { supplierId: string; branchId: string; supabase: Supabase }) {
  const { data: purchaseData } = await supabase.from("purchase_order_read").select("id, purchase_order_number").eq("branch_id", branchId).eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(200);
  const purchases = (purchaseData ?? []) as { id: string; purchase_order_number: string }[];
  const ids = purchases.map((row) => row.id);
  const [receiptResult, fulfillmentResult] = ids.length ? await Promise.all([
    supabase.from("purchase_receipt_read").select("id, purchase_order_id, receipt_number, received_at, received_base_quantity").eq("branch_id", branchId).in("purchase_order_id", ids).order("received_at", { ascending: false }).limit(50),
    supabase.from("supplier_fulfillment_read").select("id, purchase_order_id, supplier_reference, verified_at, supplier_base_quantity").eq("branch_id", branchId).in("purchase_order_id", ids).order("verified_at", { ascending: false }).limit(50),
  ]) : [{ data: [] }, { data: [] }];
  const numbers = new Map(purchases.map((row) => [row.id, row.purchase_order_number]));
  const receipts = (receiptResult.data ?? []) as unknown as ReceiptRow[];
  const fulfillments = (fulfillmentResult.data ?? []) as unknown as FulfillmentRow[];
  return <div className="page-stack">
    <section className="card list-main"><div className="section-head"><h2>Nhập kho</h2><span className="scope-chip">50 gần nhất</span></div>
      {receipts.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Phiếu nhập</th><th scope="col">Đơn mua</th><th scope="col" className="numeric">Lượng (đơn vị cơ sở)</th><th scope="col">Ngày nhận</th></tr></thead>
        <tbody>{receipts.map((row) => <tr key={row.id}>
          <td className="mono" data-label="Phiếu nhập"><Link className="code-link" href={`/admin/purchase-orders/${row.purchase_order_id}`}>{row.receipt_number}</Link></td>
          <td className="mono" data-label="Đơn mua">{numbers.get(row.purchase_order_id) ?? "—"}</td>
          <td className="numeric mono" data-label="Lượng">{formatQuantity(row.received_base_quantity)}</td>
          <td data-label="Ngày nhận">{date(row.received_at)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có phiếu nhập kho.</p>}
    </section>
    <section className="card list-main"><div className="section-head"><h2>Giao thẳng đã xác minh</h2><span className="scope-chip">50 gần nhất</span></div>
      {fulfillments.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Chứng từ NCC</th><th scope="col">Đơn mua</th><th scope="col" className="numeric">Lượng (đơn vị cơ sở)</th><th scope="col">Xác minh</th></tr></thead>
        <tbody>{fulfillments.map((row) => <tr key={row.id}>
          <td data-label="Chứng từ NCC"><Link className="code-link" href={`/admin/purchase-orders/${row.purchase_order_id}`}>{row.supplier_reference ?? "Giao thẳng"}</Link></td>
          <td className="mono" data-label="Đơn mua">{numbers.get(row.purchase_order_id) ?? "—"}</td>
          <td className="numeric mono" data-label="Lượng">{formatQuantity(row.supplier_base_quantity)}</td>
          <td data-label="Xác minh">{date(row.verified_at)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có giao thẳng đã xác minh.</p>}
    </section>
  </div>;
}

async function DebtsTab({ supplierId, branchId, supabase, canPostPayment }: { supplierId: string; branchId: string; supabase: Supabase; canPostPayment: boolean }) {
  const [payableResult, paymentResult] = await Promise.all([
    supabase.from("payable_read").select("id, source_label, original_amount_vnd::text, outstanding_amount_vnd::text, due_date, state, recorded_at").eq("branch_id", branchId).eq("supplier_id", supplierId).order("recorded_at", { ascending: false }).limit(50),
    supabase.from("payment_read").select("id, payment_number, direction, amount_vnd::text, effective_at, posting_state, reconciliation_state").eq("branch_id", branchId).eq("supplier_id", supplierId).order("effective_at", { ascending: false }).limit(50),
  ]);
  const payables = (payableResult.data ?? []) as unknown as PayableRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  return <div className="page-stack">
    <section className="card list-main"><div className="section-head"><h2>Khoản phải trả</h2>{canPostPayment && <Link className="button button-secondary button-compact" href={`/admin/payables?supplier=${supplierId}`}>Ghi chi</Link>}</div>
      {payables.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Nguồn</th><th scope="col">Đến hạn</th><th scope="col" className="numeric">Số gốc</th><th scope="col" className="numeric">Còn phải trả</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody>{payables.map((row) => <tr key={row.id}>
          <td data-label="Nguồn"><Link className="code-link" href={`/admin/payables/${row.id}`}>{financeSourceLabel(row.source_label)}</Link><small className="table-subline">{date(row.recorded_at)}</small></td>
          <td data-label="Đến hạn">{date(row.due_date)}</td>
          <td className="numeric mono" data-label="Số gốc">{money(row.original_amount_vnd)}</td>
          <td className="numeric mono" data-label="Còn phải trả"><strong>{money(row.outstanding_amount_vnd)}</strong></td>
          <td data-label="Trạng thái"><StatusBadge tone={row.state === "OVERDUE" ? "danger" : row.state === "SETTLED" ? "success" : "info"}>{financeStateLabel(row.state)}</StatusBadge></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có khoản phải trả.</p>}
    </section>
    <section className="card list-main"><div className="section-head"><h2>Thanh toán</h2><span className="scope-chip">50 gần nhất</span></div>
      {payments.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Phiếu</th><th scope="col">Loại</th><th scope="col" className="numeric">Số tiền</th><th scope="col">Ngày</th><th scope="col">Ghi sổ</th><th scope="col">Đối soát</th></tr></thead>
        <tbody>{payments.map((row) => <tr key={row.id}>
          <td className="mono" data-label="Phiếu">{row.payment_number}</td>
          <td data-label="Loại">{row.direction === "DISBURSEMENT" ? "Chi" : "Thu"}</td>
          <td className="numeric mono" data-label="Số tiền">{money(row.amount_vnd)}</td>
          <td data-label="Ngày">{date(row.effective_at)}</td>
          <td data-label="Ghi sổ">{financeStateLabel(row.posting_state)}</td>
          <td data-label="Đối soát">{financeStateLabel(row.reconciliation_state)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có thanh toán.</p>}
    </section>
  </div>;
}

async function PricesTab({ supplierId, branchId, supabase, canManage }: { supplierId: string; branchId: string; supabase: Supabase; canManage: boolean }) {
  const { data } = await supabase.from("purchase_price_rules").select("id, material_id, purchase_uom_id, unit_cost_vnd::text, version, source_type, effective_from, effective_to")
    .eq("branch_id", branchId).eq("supplier_id", supplierId).eq("active", true).order("effective_from", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as PriceRow[];
  const materialIds = [...new Set(rows.map((row) => row.material_id))];
  const [materialResult, unitResult] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id, name").in("id", materialIds) : Promise.resolve({ data: [] }),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
  ]);
  const names = new Map((materialResult.data ?? []).map((row) => [row.id, row.name]));
  const units = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  return <section className="card list-main"><div className="section-head"><h2>Bảng giá mua</h2>
    {canManage && <Link className="button button-secondary button-compact" href={`/admin/suppliers/pricing?supplier=${supplierId}`}>Sửa bảng giá mua</Link>}</div>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Vật tư</th><th scope="col" className="numeric">Giá mua</th><th scope="col">Hiệu lực</th><th scope="col">Nguồn</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td data-label="Vật tư">{names.get(row.material_id) ?? "Vật tư"}</td>
        <td className="numeric mono" data-label="Giá mua">{money(row.unit_cost_vnd)} / {units.get(row.purchase_uom_id) ?? "đơn vị"}</td>
        <td data-label="Hiệu lực">Từ {date(row.effective_from)}{row.effective_to ? ` đến trước ${date(row.effective_to)}` : ""}</td>
        <td data-label="Nguồn">{priceSourceLabel(row.source_type)} · phiên bản {row.version}</td>
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có giá mua đang dùng cho nhà cung cấp này.</p>}
  </section>;
}
