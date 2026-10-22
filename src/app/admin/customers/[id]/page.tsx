import { formatBusinessDate } from "@/lib/core/business-time";
import { salesDeliveryStateLabel, salesStateLabel, salesStateTone } from "@/modules/sales/presentation";
import { deliveryStateLabel, deliveryStateTone } from "@/modules/delivery/presentation";
import { financeStateLabel, financeSourceLabel } from "@/modules/finance/presentation";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import Link from "next/link";
import { activeTab, DetailTabs, type DetailTab } from "@/components/ui/detail-tabs";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { QUOTATIONS_ENABLED } from "@/lib/features";
import { CatalogCreateButton, CatalogEditButton } from "@/modules/catalog/catalog-dialog";
import { catalogCreateProps, catalogRecordProps } from "@/modules/catalog/editor-data";
import { catalogHref } from "@/modules/catalog/ownership";
import { PortalAccountsCard, type PortalAccount } from "@/components/customers/portal-accounts-card";

type CustomerProfile = { id: string; code: string; display_name: string; customer_type: string; phone: string | null; email: string | null; address_text: string | null; tax_code: string | null; tier_code: string | null; payment_terms_days: number; active: boolean; source?: string };
type SiteRow = { id: string; code: string; name: string; address_text: string; receiver_name: string | null; receiver_phone: string | null; access_note: string | null; active: boolean };
type PriceRow = { id: string; scope_type: string; unit_price_vnd: string; version: number; source_type: string; material_id: string | null; material_group_id: string | null; price_uom_id: string; effective_from: string };
type QuoteRow = { id: string; quotation_number: string; revision_number: number; created_at: string };
type OrderRow = { id: string; order_number: string; commercial_state: string; fulfillment_state: string; payment_state: string; total_vnd: string; site_name_snapshot: string; created_at: string };
type DeliveryRow = { id: string; delivery_number: string; execution_state: string; result_kind: string | null; site_name_snapshot: string; scheduled_at: string | null; created_at: string };
type ReceivableRow = { id: string; source_label: string; site_name: string | null; due_date: string; original_amount_vnd: string; outstanding_amount_vnd: string; state: string; recorded_at: string };
type PaymentRow = { id: string; payment_number: string; direction: string; amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string };
type CreditSummary = { credit_limit_vnd: number | string | null; receivable_vnd: number | string; overdue_vnd: number | string; available_vnd: number | string | null };

const date = (value: string) => formatBusinessDate(value);
const money = (value: string | number | bigint) => formatVnd(vnd(String(value)));
const OPEN_FULFILLMENT_DONE = new Set(["FULFILLED", "CLOSED_REMAINDER"]);

/**
 * Customer 360 (FB2 Đợt 4, KiotViet-style): who the customer is, what they owe and can still buy on credit, then one tab
 * per subject. Only the open tab's records are read; every number comes from the existing read views.
 */
export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/admin/customers/[id]">) {
  const access = await requireInternalPermission("customers.read");
  const { id } = await params;
  const query = (await searchParams) as { tab?: string };
  const can = {
    finance: access.permissions.has("finance.ar.read"),
    pricing: access.permissions.has("pricing.read"),
    orders: access.permissions.has("orders.read"),
    deliveries: access.permissions.has("delivery.read"),
    manage: access.permissions.has("customers.manage"),
    createOrder: access.permissions.has("orders.create"),
    createQuote: QUOTATIONS_ENABLED && access.permissions.has("quotation.create"),
    service: access.permissions.has("service.manage"),
  };
  const canPostPayment = can.finance && access.permissions.has("finance.payment.post");
  const supabase = await createServerSupabase();
  const { data: profile, error } = await supabase.from("customers").select("id, code, display_name, customer_type, phone, email, address_text, tax_code, tier_code, payment_terms_days, active, source")
    .eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error || !profile) notFound();
  const customer = profile as unknown as CustomerProfile;

  const none = Promise.resolve({ data: null, error: null });
  const selfRegistered = customer.source === "SELF_REGISTERED";
  const [groupResult, creditResult, orderStatResult, siteCountResult, privateResult, samePhoneResult] = await Promise.all([
    customer.tier_code ? supabase.from("customer_price_groups").select("name").eq("branch_id", access.branchId).eq("code", customer.tier_code).maybeSingle() : none,
    can.finance ? supabase.rpc("customer_credit_summary", { target_customer_id: id }) : none,
    can.orders ? supabase.from("sales_order_read").select("total_vnd::text, commercial_state, fulfillment_state").eq("branch_id", access.branchId).eq("customer_id", id).limit(5000) : Promise.resolve({ data: [], error: null }),
    supabase.from("customer_sites").select("id", { count: "exact", head: true }).eq("customer_id", id).eq("active", true),
    can.manage ? supabase.rpc("customer_private_fields", { target_customer_ids: [id] }).select("customer_id,internal_note") : none,
    // D14: a self-registered customer is never merged automatically; the business sees who already has this phone number.
    selfRegistered && customer.phone ? supabase.from("customers").select("id, code, display_name").eq("branch_id", access.branchId).eq("phone", customer.phone).neq("id", id).limit(5) : none,
  ]);
  const samePhone = ((samePhoneResult.data ?? []) as { id: string; code: string; display_name: string }[]);
  const credit = creditResult.data as CreditSummary | null;
  const orderStats = (orderStatResult.data ?? []) as { total_vnd: string; commercial_state: string; fulfillment_state: string }[];
  const confirmed = orderStats.filter((row) => ["CONFIRMED", "CLOSED"].includes(row.commercial_state));
  const totalSales = confirmed.reduce((sum, row) => sum + BigInt(row.total_vnd), 0n);
  const openOrders = orderStats.filter((row) => row.commercial_state === "CONFIRMED" && !OPEN_FULFILLMENT_DONE.has(row.fulfillment_state)).length;
  const privateRow = (Array.isArray(privateResult.data) ? privateResult.data[0] : privateResult.data) as { internal_note: string | null } | null;

  const tabs: DetailTab[] = [
    { id: "info", label: "Thông tin & công trình", count: siteCountResult.count ?? undefined },
    ...(can.orders ? [{ id: "orders", label: "Đơn bán", count: orderStats.length }] : []),
    ...(can.deliveries ? [{ id: "deliveries", label: "Giao hàng" }] : []),
    ...(can.finance ? [{ id: "debts", label: "Công nợ & thanh toán" }] : []),
    ...(can.pricing ? [{ id: "prices", label: "Giá riêng" }] : []),
    { id: "documents", label: "Tài liệu" },
  ];
  const tab = activeTab(tabs, query.tab);
  const [editProps, siteProps] = can.manage
    ? await Promise.all([catalogRecordProps("customers", id, access, supabase), catalogCreateProps("sites", access, supabase)]) : [null, null];

  // Only the open tab is read; awaited here so the page streams as one piece.
  const body = tab === "info" ? await InfoTab({ customer, note: can.manage ? privateRow?.internal_note ?? null : undefined, can, supabase })
    : tab === "orders" ? await OrdersTab({ customerId: id, branchId: access.branchId, supabase })
    : tab === "deliveries" ? await DeliveriesTab({ customerId: id, branchId: access.branchId, supabase })
    : tab === "debts" ? await DebtsTab({ customerId: id, branchId: access.branchId, supabase, canPostPayment })
    : tab === "prices" ? await PricesTab({ customerId: id, branchId: access.branchId, supabase, canManage: access.permissions.has("pricing.manage") })
    : await DocumentsTab({ customerId: id, branchId: access.branchId, supabase, can: { quotes: QUOTATIONS_ENABLED && access.permissions.has("quotation.read"), deliveries: can.deliveries, finance: can.finance } });

  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Khách hàng · {customer.code}{selfRegistered && <> · <span className="scope-chip">Tự đăng ký</span></>}</p><h1>{customer.display_name}</h1>
      <p className="lede">{customer.phone ?? "Chưa có điện thoại"} · {customer.address_text ?? "Chưa có địa chỉ chính"} · {customer.tier_code ? `Nhóm giá ${(groupResult.data as { name: string } | null)?.name ?? customer.tier_code}` : "Giá chung"}</p></div>
      <div className="form-actions">
        {can.createOrder && customer.active && <Link className="button button-primary" href={`/admin/orders/new?customer=${customer.id}`}>Tạo đơn</Link>}
        {canPostPayment && <Link className="button button-secondary" href={`/admin/receivables?customer=${customer.id}`}>Ghi thu</Link>}
        {can.service && customer.active && <Link className="button button-secondary" href={`/admin/service-jobs?customerId=${customer.id}`}>Tạo dịch vụ</Link>}
        {can.createQuote && <Link className="button button-secondary" href={`/admin/quotations/new?customer=${customer.id}`}>Tạo báo giá</Link>}
        {editProps && <CatalogEditButton {...editProps} label="Sửa" />}
        {siteProps && <CatalogCreateButton {...siteProps} initial={{ customer_id: customer.id }} label="+ Công trình" className="button button-secondary" />}
        <StatusBadge tone={customer.active ? "success" : "danger"}>{customer.active ? "Đang giao dịch" : "Ngừng giao dịch"}</StatusBadge>
      </div>
    </header>
    {samePhone.length > 0 && <p className="form-message warning" role="note"><strong>Có thể trùng khách:</strong> cùng số điện thoại với {samePhone.map((row, index) => <span key={row.id}>{index ? ", " : " "}<Link className="code-link" href={`/admin/customers/${row.id}`}>{row.code} · {row.display_name}</Link></span>)}. Kiểm tra trước khi giao dịch; hệ thống không tự gộp.</p>}
    <section className="metric-grid metric-grid-5" aria-label="Chỉ số khách hàng">
      <article className="card metric-card"><span className="metric-label">Nợ hiện tại</span><strong className="metric-value">{credit ? money(credit.receivable_vnd) : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Nợ quá hạn</span><strong className={`metric-value${credit && BigInt(String(credit.overdue_vnd)) > 0n ? " text-danger" : ""}`}>{credit ? money(credit.overdue_vnd) : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Tổng bán (đơn đã xác nhận)</span><strong className="metric-value">{can.orders ? money(totalSales) : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Đơn đang giao dở</span><strong className="metric-value">{can.orders ? openOrders : "—"}</strong></article>
      <article className="card metric-card"><span className="metric-label">Hạn mức còn lại</span><strong className="metric-value">{credit ? credit.available_vnd === null ? "Chưa duyệt" : money(credit.available_vnd) : "—"}</strong>
        {credit && credit.credit_limit_vnd !== null && <small className="table-subline">Hạn mức {money(credit.credit_limit_vnd)}</small>}</article>
    </section>
    <DetailTabs tabs={tabs} active={tab} label="Nội dung khách hàng" href={(next) => `/admin/customers/${customer.id}?tab=${next}`} />
    {body}
  </div>;
}

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

async function InfoTab({ customer, note, can, supabase }: { customer: CustomerProfile; note: string | null | undefined; can: { createOrder: boolean; service: boolean; manage: boolean }; supabase: Supabase }) {
  const [{ data }, accountsResult] = await Promise.all([
    supabase.from("customer_sites").select("id, code, name, address_text, receiver_name, receiver_phone, access_note, active").eq("customer_id", customer.id).order("active", { ascending: false }).order("name").limit(100),
    supabase.rpc("customer_portal_accounts", { target_customer_id: customer.id }),
  ]);
  const sites = (data ?? []) as unknown as SiteRow[];
  const accounts = accountsResult.error ? null : ((accountsResult.data ?? []) as PortalAccount[]);
  return <div className="two-column">
    <section className="card list-main"><div className="section-head"><h2>Công trình ({sites.length})</h2></div>
      {sites.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Công trình</th><th scope="col">Người nhận</th><th scope="col"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody>{sites.map((site) => <tr key={site.id} className={site.active ? undefined : "row-muted"}>
          <td data-label="Công trình"><strong>{site.name}</strong><small className="table-subline">{site.address_text}</small>{site.access_note && <small className="table-subline">{site.access_note}</small>}{!site.active && <small className="table-subline">Đã ngừng</small>}</td>
          <td data-label="Người nhận">{site.receiver_name ?? "Chưa chỉ định"}{site.receiver_phone && <small className="table-subline">{site.receiver_phone}</small>}</td>
          <td className="table-actions">{site.active && can.createOrder && <Link className="code-link" href={`/admin/orders/new?customer=${customer.id}&site=${site.id}`}>Tạo đơn</Link>}
            {site.active && can.service && <Link className="code-link" href={`/admin/service-jobs?customerId=${customer.id}&siteId=${site.id}`}>Tạo dịch vụ</Link>}
            {can.manage && <Link className="code-link" href={catalogHref("sites", { id: site.id })}>Sửa</Link>}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có công trình. Bấm “+ Công trình” để thêm.</p>}
    </section>
    <div className="page-stack"><section className="card card-pad"><h2>Hồ sơ</h2><dl className="detail-grid">
      <div className="detail-item"><dt>Loại khách</dt><dd>{customer.customer_type === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân"}</dd></div>
      <div className="detail-item"><dt>Điều khoản thanh toán</dt><dd>{customer.payment_terms_days} ngày</dd></div>
      <div className="detail-item"><dt>Thư điện tử</dt><dd>{customer.email ?? "Chưa có"}</dd></div>
      <div className="detail-item"><dt>Mã số thuế</dt><dd>{customer.tax_code ?? "Chưa có"}</dd></div>
      {note !== undefined && <div className="detail-item field-full"><dt>Ghi chú nội bộ</dt><dd>{note ?? "Chưa có"}</dd></div>}
    </dl></section>
    {accounts && <PortalAccountsCard customerId={customer.id} customerPhone={customer.phone} accounts={accounts} canManage={can.manage} />}</div>
  </div>;
}

async function OrdersTab({ customerId, branchId, supabase }: { customerId: string; branchId: string; supabase: Supabase }) {
  const { data } = await supabase.from("sales_order_read").select("id, order_number, commercial_state, fulfillment_state, payment_state, total_vnd::text, site_name_snapshot, created_at")
    .eq("branch_id", branchId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as OrderRow[];
  return <section className="card list-main"><div className="section-head"><h2>Đơn bán</h2><span className="scope-chip">50 gần nhất</span></div>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Mã đơn</th><th scope="col">Công trình</th><th scope="col">Trạng thái</th><th scope="col">Giao hàng</th><th scope="col">Thanh toán</th><th scope="col" className="numeric">Tổng tiền</th><th scope="col">Ngày tạo</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td className="mono" data-label="Mã đơn"><Link className="code-link" href={`/admin/orders/${row.id}`}>{row.order_number}</Link></td>
        <td data-label="Công trình">{row.site_name_snapshot}</td>
        <td data-label="Trạng thái"><StatusBadge tone={salesStateTone(row.commercial_state)}>{salesStateLabel(row.commercial_state)}</StatusBadge></td>
        <td data-label="Giao hàng">{salesDeliveryStateLabel(row.fulfillment_state)}</td>
        <td data-label="Thanh toán">{salesStateLabel(row.payment_state)}</td>
        <td className="numeric mono" data-label="Tổng tiền">{money(row.total_vnd)}</td>
        <td data-label="Ngày tạo">{date(row.created_at)}</td>
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có đơn bán.</p>}
  </section>;
}

async function DeliveriesTab({ customerId, branchId, supabase }: { customerId: string; branchId: string; supabase: Supabase }) {
  const { data } = await supabase.from("delivery_read").select("id, delivery_number, execution_state, result_kind, site_name_snapshot, scheduled_at, created_at")
    .eq("branch_id", branchId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(50);
  const rows = (data ?? []) as unknown as DeliveryRow[];
  return <section className="card list-main"><div className="section-head"><h2>Giao hàng</h2><span className="scope-chip">50 gần nhất</span></div>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Phiếu giao</th><th scope="col">Công trình</th><th scope="col">Lịch giao</th><th scope="col">Trạng thái</th><th scope="col">Kết quả</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td className="mono" data-label="Phiếu giao"><Link className="code-link" href={`/admin/deliveries/${row.id}`}>{row.delivery_number}</Link></td>
        <td data-label="Công trình">{row.site_name_snapshot}</td>
        <td data-label="Lịch giao">{row.scheduled_at ? date(row.scheduled_at) : "Chưa hẹn"}</td>
        <td data-label="Trạng thái"><StatusBadge tone={deliveryStateTone(row.execution_state)}>{deliveryStateLabel(row.execution_state)}</StatusBadge></td>
        <td data-label="Kết quả">{row.result_kind ? deliveryStateLabel(row.result_kind) : "Chưa có"}</td>
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có phiếu giao.</p>}
  </section>;
}

async function DebtsTab({ customerId, branchId, supabase, canPostPayment }: { customerId: string; branchId: string; supabase: Supabase; canPostPayment: boolean }) {
  const [receivableResult, paymentResult] = await Promise.all([
    supabase.from("receivable_read").select("id, source_label, site_name, due_date, original_amount_vnd::text, outstanding_amount_vnd::text, state, recorded_at").eq("branch_id", branchId).eq("customer_id", customerId).order("recorded_at", { ascending: false }).limit(50),
    supabase.from("payment_read").select("id, payment_number, direction, amount_vnd::text, effective_at, posting_state, reconciliation_state").eq("branch_id", branchId).eq("customer_id", customerId).order("effective_at", { ascending: false }).limit(50),
  ]);
  const receivables = (receivableResult.data ?? []) as unknown as ReceivableRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  return <div className="page-stack">
    <section className="card list-main"><div className="section-head"><h2>Khoản phải thu</h2><div className="inline-actions">
      <Link className="code-link" href={`/api/customers/${customerId}/debt-statement/pdf`}>Tải bảng đối chiếu công nợ</Link>
      {canPostPayment && <Link className="button button-secondary button-compact" href={`/admin/receivables?customer=${customerId}`}>Ghi thu</Link>}</div></div>
      {receivables.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Nguồn</th><th scope="col">Công trình</th><th scope="col">Đến hạn</th><th scope="col" className="numeric">Số gốc</th><th scope="col" className="numeric">Còn phải thu</th><th scope="col">Trạng thái</th></tr></thead>
        <tbody>{receivables.map((row) => <tr key={row.id}>
          <td data-label="Nguồn"><Link className="code-link" href={`/admin/receivables/${row.id}`}>{financeSourceLabel(row.source_label)}</Link><small className="table-subline">{date(row.recorded_at)}</small></td>
          <td data-label="Công trình">{row.site_name ?? "—"}</td>
          <td data-label="Đến hạn">{date(row.due_date)}</td>
          <td className="numeric mono" data-label="Số gốc">{money(row.original_amount_vnd)}</td>
          <td className="numeric mono" data-label="Còn phải thu"><strong>{money(row.outstanding_amount_vnd)}</strong></td>
          <td data-label="Trạng thái"><StatusBadge tone={row.state === "OVERDUE" ? "danger" : row.state === "SETTLED" ? "success" : "info"}>{financeStateLabel(row.state)}</StatusBadge></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có khoản phải thu.</p>}
    </section>
    <section className="card list-main"><div className="section-head"><h2>Thanh toán</h2><span className="scope-chip">50 gần nhất</span></div>
      {payments.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Phiếu</th><th scope="col">Loại</th><th scope="col" className="numeric">Số tiền</th><th scope="col">Ngày</th><th scope="col">Ghi sổ</th><th scope="col">Đối soát</th></tr></thead>
        <tbody>{payments.map((row) => <tr key={row.id}>
          <td className="mono" data-label="Phiếu">{row.payment_number}</td>
          <td data-label="Loại">{row.direction === "RECEIPT" ? "Thu" : "Chi"}</td>
          <td className="numeric mono" data-label="Số tiền">{money(row.amount_vnd)}</td>
          <td data-label="Ngày">{date(row.effective_at)}</td>
          <td data-label="Ghi sổ">{financeStateLabel(row.posting_state)}</td>
          <td data-label="Đối soát">{financeStateLabel(row.reconciliation_state)}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-inline">Chưa có thanh toán.</p>}
    </section>
  </div>;
}

async function PricesTab({ customerId, branchId, supabase, canManage }: { customerId: string; branchId: string; supabase: Supabase; canManage: boolean }) {
  const { data } = await supabase.from("pricing_rule_read").select("id, scope_type, unit_price_vnd::text, version, source_type, material_id, material_group_id, price_uom_id, effective_from")
    .eq("branch_id", branchId).eq("customer_id", customerId).eq("active", true).order("effective_from", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as PriceRow[];
  const materialIds = [...new Set(rows.flatMap((row) => row.material_id ? [row.material_id] : []))];
  const groupIds = [...new Set(rows.flatMap((row) => row.material_group_id ? [row.material_group_id] : []))];
  const [materialResult, groupResult, unitResult] = await Promise.all([
    materialIds.length ? supabase.from("materials").select("id, name").in("id", materialIds) : Promise.resolve({ data: [] }),
    groupIds.length ? supabase.from("material_groups").select("id, name").in("id", groupIds) : Promise.resolve({ data: [] }),
    supabase.from("units_of_measure").select("id, symbol").limit(1000),
  ]);
  const names = new Map([...(materialResult.data ?? []), ...(groupResult.data ?? [])].map((row) => [row.id, row.name]));
  const units = new Map((unitResult.data ?? []).map((row) => [row.id, row.symbol]));
  return <section className="card list-main"><div className="section-head"><h2>Giá riêng của khách</h2>
    {canManage && <Link className="button button-secondary button-compact" href="/admin/settings/pricing">Đặt giá riêng</Link>}</div>
    <p className="muted card-pad-x">Giá riêng được ưu tiên hơn giá nhóm và giá chung. Đơn đã chốt giữ nguyên giá lúc lập.</p>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Áp dụng cho</th><th scope="col" className="numeric">Giá</th><th scope="col">Từ ngày</th><th scope="col">Nguồn</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id}>
        <td data-label="Áp dụng cho">{row.material_id ? names.get(row.material_id) ?? "Vật tư" : `Nhóm ${names.get(row.material_group_id ?? "") ?? "vật tư"}`}</td>
        <td className="numeric mono" data-label="Giá">{money(row.unit_price_vnd)} / {units.get(row.price_uom_id) ?? "đơn vị"}</td>
        <td data-label="Từ ngày">{date(row.effective_from)}</td>
        <td data-label="Nguồn">{priceSourceLabel(row.source_type)} · phiên bản {row.version}</td>
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Khách đang dùng giá nhóm hoặc giá chung.</p>}
  </section>;
}

async function DocumentsTab({ customerId, branchId, supabase, can }: { customerId: string; branchId: string; supabase: Supabase; can: { quotes: boolean; deliveries: boolean; finance: boolean } }) {
  const [quoteResult, deliveryResult, paymentResult] = await Promise.all([
    can.quotes ? supabase.from("quotation_read").select("id, quotation_number, revision_number, created_at").eq("branch_id", branchId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    can.deliveries ? supabase.from("delivery_read").select("id, delivery_number, created_at").eq("branch_id", branchId).eq("customer_id", customerId).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    can.finance ? supabase.from("payment_read").select("id, payment_number, direction, effective_at").eq("branch_id", branchId).eq("customer_id", customerId).order("effective_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ]);
  const documents = [
    ...((quoteResult.data ?? []) as unknown as QuoteRow[]).map((row) => ({ id: `quote-${row.id}`, label: `Báo giá ${row.quotation_number} · R${row.revision_number}`, kind: "Báo giá", at: row.created_at, href: `/admin/quotations/${row.id}` })),
    ...((deliveryResult.data ?? []) as unknown as { id: string; delivery_number: string; created_at: string }[]).map((row) => ({ id: `delivery-${row.id}`, label: `Phiếu giao ${row.delivery_number}`, kind: "Phiếu giao", at: row.created_at, href: `/admin/deliveries/${row.id}` })),
    ...((paymentResult.data ?? []) as unknown as { id: string; payment_number: string; direction: string; effective_at: string }[]).map((row) => ({ id: `payment-${row.id}`, label: `Phiếu ${row.direction === "RECEIPT" ? "thu" : "chi"} ${row.payment_number}`, kind: "Phiếu tiền", at: row.effective_at, href: "/admin/cashbook" })),
  ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 30);
  return <section className="card card-pad"><div className="section-head flush"><h2>Tài liệu</h2><span className="scope-chip">Chứng từ gốc</span></div>
    <ul className="clean-list">{documents.map((row) => <li key={row.id}><Link className="code-link" href={row.href}>{row.label}</Link><small>{row.kind} · {date(row.at)}</small></li>)}</ul>
    {!documents.length && <p className="empty-inline">Chưa có tài liệu nghiệp vụ có thể truy vết.</p>}
    <p className="muted">Danh sách mở bản ghi nguồn; chỉ hiển thị tài liệu đã phát hành và bạn có quyền xem.</p>
  </section>;
}
