import { formatBusinessDate } from "@/lib/core/business-time";
import { salesStateLabel } from "@/modules/sales/presentation";
import { deliveryStateLabel } from "@/modules/delivery/presentation";
import { financeStateLabel, financeSourceLabel } from "@/modules/finance/presentation";
import { priceSourceLabel } from "@/modules/pricing/presentation";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

type CustomerProfile = { id: string; code: string; display_name: string; customer_type: string; phone: string | null; email: string | null; address_text: string | null; tax_code: string | null; tier_code: string | null; payment_terms_days: number; credit_limit_vnd?: string | number | null; internal_note?: string | null; active: boolean };
type SiteRow = { id: string; code: string; name: string; address_text: string; receiver_name: string | null; receiver_phone: string | null; receiving_window: string | null; access_note: string | null; active: boolean };
type PriceRow = { id: string; scope_type: string; unit_price_vnd: string; version: number; source_type: string; material_id: string | null; price_uom_id: string };
type QuoteRow = { id: string; quotation_number: string; revision_number: number; state: string; total_vnd: string; site_name_snapshot: string; created_at: string };
type OrderRow = { id: string; order_number: string; commercial_state: string; fulfillment_state: string; payment_state: string; total_vnd: string; site_name_snapshot: string; created_at: string };
type DeliveryRow = { id: string; delivery_number: string; execution_state: string; result_kind: string | null; site_name_snapshot: string; created_at: string };
type ReceivableRow = { id: string; source_label: string; site_name: string | null; due_date: string; original_amount_vnd: string; outstanding_amount_vnd: string; state: string; recorded_at: string };
type PaymentRow = { id: string; payment_number: string; direction: string; amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string };

function date(value: string) {
  return formatBusinessDate(value);
}

export default async function CustomerDetailPage({ params }: PageProps<"/admin/customers/[id]">) {
  const access = await requireInternalPermission("customers.read");
  const { id } = await params;
  const canReadFinance = access.permissions.has("finance.ar.read");
  const canReadPricing = access.permissions.has("pricing.read");
  const canReadQuotes = access.permissions.has("quotation.read");
  const canReadOrders = access.permissions.has("orders.read");
  const canReadDeliveries = access.permissions.has("delivery.read");
  const canManageCustomer = access.permissions.has("customers.manage");
  const canCreateOrder = access.permissions.has("orders.create");
  const canCreateQuote = access.permissions.has("quotation.create");
  const canPostPayment = canReadFinance && access.permissions.has("finance.payment.post");
  const supabase = await createServerSupabase();
  const profileFields = "id, code, display_name, customer_type, phone, email, address_text, tax_code, tier_code, payment_terms_days, active";
  const { data: profile, error } = await supabase.from("customers").select(profileFields).eq("id", id).eq("branch_id", access.branchId).maybeSingle();
  if (error || !profile) notFound();
  const { data: privateFields, error: privateFieldsError } = await supabase.rpc("customer_private_fields", { target_customer_ids: [id] });
  if (privateFieldsError) throw new Error("Không tải được thông tin riêng tư hồ sơ khách hàng.");
  const privateField = privateFields?.[0];
  const customer = {
    ...(profile as unknown as CustomerProfile),
    credit_limit_vnd: canReadFinance ? privateField?.credit_limit_vnd ?? null : undefined,
    internal_note: canManageCustomer ? privateField?.internal_note ?? null : undefined,
  };

  const [siteResult, priceResult, quoteResult, orderResult, deliveryResult, receivableResult, paymentResult, materialResult, uomResult] = await Promise.all([
    supabase.from("customer_sites").select("id, code, name, address_text, receiver_name, receiver_phone, receiving_window, access_note, active").eq("customer_id", id).order("name").limit(50),
    canReadPricing ? supabase.from("pricing_rule_read").select("id, scope_type, unit_price_vnd, version, source_type, material_id, price_uom_id").eq("branch_id", access.branchId).eq("customer_id", id).eq("active", true).order("effective_from", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    canReadQuotes ? supabase.from("quotation_read").select("id, quotation_number, revision_number, state, total_vnd, site_name_snapshot, created_at").eq("branch_id", access.branchId).eq("customer_id", id).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    canReadOrders ? supabase.from("sales_order_read").select("id, order_number, commercial_state, fulfillment_state, payment_state, total_vnd, site_name_snapshot, created_at").eq("branch_id", access.branchId).eq("customer_id", id).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    canReadDeliveries ? supabase.from("delivery_read").select("id, delivery_number, execution_state, result_kind, site_name_snapshot, created_at").eq("branch_id", access.branchId).eq("customer_id", id).order("created_at", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
    canReadFinance ? supabase.from("receivable_read").select("id, source_label, site_name, due_date, original_amount_vnd, outstanding_amount_vnd, state, recorded_at").eq("branch_id", access.branchId).eq("customer_id", id).order("recorded_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    canReadFinance ? supabase.from("payment_read").select("id, payment_number, direction, amount_vnd, effective_at, posting_state, reconciliation_state").eq("branch_id", access.branchId).eq("customer_id", id).order("effective_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    canReadPricing ? supabase.from("materials").select("id, name").eq("active", true).order("name").limit(500) : Promise.resolve({ data: [] }),
    canReadPricing ? supabase.from("units_of_measure").select("id, symbol").eq("active", true).order("symbol").limit(100) : Promise.resolve({ data: [] }),
  ]);
  const sites = (siteResult.data ?? []) as unknown as SiteRow[];
  const prices = (priceResult.data ?? []) as unknown as PriceRow[];
  const quotes = (quoteResult.data ?? []) as unknown as QuoteRow[];
  const orders = (orderResult.data ?? []) as unknown as OrderRow[];
  const deliveries = (deliveryResult.data ?? []) as unknown as DeliveryRow[];
  const receivables = (receivableResult.data ?? []) as unknown as ReceivableRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  const materialNames = new Map((materialResult.data ?? []).map((material) => [material.id, material.name]));
  const uomSymbols = new Map((uomResult.data ?? []).map((uom) => [uom.id, uom.symbol]));
  const outstanding = receivables.reduce((total, row) => total + BigInt(row.outstanding_amount_vnd), 0n);
  const documents = [
    ...quotes.map((row) => ({ id: `quote-${row.id}`, label: `Báo giá ${row.quotation_number} · R${row.revision_number}`, kind: "Báo giá", at: row.created_at, href: `/admin/quotations/${row.id}` })),
    ...deliveries.map((row) => ({ id: `delivery-${row.id}`, label: `Phiếu giao ${row.delivery_number}`, kind: "Phiếu giao", at: row.created_at, href: `/admin/deliveries/${row.id}` })),
    ...payments.map((row) => ({ id: `payment-${row.id}`, label: `Phiếu ${row.direction === "RECEIPT" ? "thu" : "chi"} ${row.payment_number}`, kind: "Phiếu tiền", at: row.effective_at, href: "/admin/cashbook" })),
  ].sort((left, right) => right.at.localeCompare(left.at)).slice(0, 20);

  return <>
    <header className="page-heading"><div><p className="eyebrow">Khách hàng · {customer.code}</p><h1>{customer.display_name}</h1><p className="lede">{customer.phone ?? "Chưa có điện thoại"} · {customer.address_text ?? "Chưa có địa chỉ chính"}</p></div><div className="form-actions">{canCreateOrder && <Link className="button button-primary" href={`/admin/orders/new?customer=${customer.id}`}>Tạo đơn</Link>}{canCreateQuote && <Link className="button button-secondary" href={`/admin/quotations/new?customer=${customer.id}`}>Tạo báo giá</Link>}{canPostPayment && <Link className="button button-secondary" href={`/admin/receivables?customer=${customer.id}`}>Ghi nhận thu tiền</Link>}<StatusBadge tone={customer.active ? "success" : "danger"}>{customer.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></div></header>
    <nav className="filter-bar" aria-label="Ngữ cảnh khách hàng"><a className="code-link" href="#profile">Hồ sơ</a><a className="code-link" href="#sites">Công trình</a><a className="code-link" href="#pricing">Giá</a><a className="code-link" href="#quotes">Báo giá</a><a className="code-link" href="#orders">Đơn bán</a><a className="code-link" href="#deliveries">Giao hàng</a><a className="code-link" href="#receivables">Phải thu</a><a className="code-link" href="#payments">Thanh toán</a><a className="code-link" href="#documents">Tài liệu</a></nav>
    <section className="metric-grid"><article className="card metric-card"><span className="metric-label">Công trình</span><strong className="metric-value">{sites.length}</strong></article><article className="card metric-card"><span className="metric-label">Chính sách giá riêng</span><strong className="metric-value">{canReadPricing ? prices.length : "—"}</strong></article><article className="card metric-card"><span className="metric-label">Phải thu đang tải</span><strong className="metric-value">{canReadFinance ? formatVnd(vnd(outstanding)) : "Không có quyền"}</strong></article><article className="card metric-card"><span className="metric-label">Hạn mức</span><strong className="metric-value">{canReadFinance ? customer.credit_limit_vnd == null ? "Chưa duyệt" : formatVnd(vnd(customer.credit_limit_vnd.toString())) : "Không có quyền"}</strong></article></section>
    <div className="two-column">
      <section className="card card-pad" id="profile"><h2>Hồ sơ</h2><dl className="detail-grid"><div className="detail-item"><dt>Loại khách</dt><dd>{customer.customer_type === "BUSINESS" ? "Doanh nghiệp" : "Cá nhân"}</dd></div><div className="detail-item"><dt>Điều khoản</dt><dd>{customer.payment_terms_days} ngày</dd></div><div className="detail-item"><dt>Thư điện tử</dt><dd>{customer.email ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Mã số thuế</dt><dd>{customer.tax_code ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Nhóm khách</dt><dd>{customer.tier_code ?? "Chưa phân nhóm"}</dd></div>{canManageCustomer && <div className="detail-item field-full"><dt>Ghi chú nội bộ</dt><dd>{customer.internal_note ?? "Chưa có"}</dd></div>}</dl></section>
      <section className="card card-pad" id="sites"><div className="section-head flush"><h2>Công trình</h2><span className="scope-chip">Tối đa 50</span></div><ul className="clean-list">{sites.map((site) => <li key={site.id}><strong>{site.name}</strong><small>{site.address_text} · Người nhận: {site.receiver_name ?? "Chưa chỉ định"} {site.receiver_phone ?? ""}</small><small>{site.receiving_window ?? "Không giới hạn giờ nhận"}{site.access_note ? ` · ${site.access_note}` : ""}</small>{canCreateOrder && site.active && <Link className="code-link" href={`/admin/orders/new?customer=${customer.id}&site=${site.id}`}>Tạo đơn cho công trình</Link>}</li>)}</ul>{!sites.length && <p className="empty-inline">Chưa có công trình.</p>}</section>
    </div>
    <section className="card card-pad" id="pricing"><div className="section-head flush"><h2>Giá</h2><span className="scope-chip">Chính sách đang hiệu lực</span></div>{canReadPricing ? <ul className="clean-list">{prices.map((price) => <li key={price.id}><strong>{price.material_id ? materialNames.get(price.material_id) ?? "Vật tư" : "Nhóm vật tư"}</strong><small>{formatVnd(vnd(price.unit_price_vnd))} / {uomSymbols.get(price.price_uom_id) ?? "đơn vị"} · phiên bản {price.version} · {priceSourceLabel(price.source_type)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem chính sách giá.</p>}{canReadPricing && !prices.length && <p className="empty-inline">Không có chính sách giá riêng đang hiệu lực.</p>}</section>
    <div className="two-column">
      <section className="card card-pad" id="quotes"><div className="section-head flush"><h2>Báo giá</h2><span className="scope-chip">12 gần nhất</span></div>{canReadQuotes ? <ul className="clean-list">{quotes.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/quotations/${row.id}`}>{row.quotation_number} · R{row.revision_number}</Link><small>{row.site_name_snapshot} · {salesStateLabel(row.state)} · {formatVnd(vnd(row.total_vnd))} · {date(row.created_at)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem báo giá.</p>}{canReadQuotes && !quotes.length && <p className="empty-inline">Chưa có báo giá.</p>}</section>
      <section className="card card-pad" id="orders"><div className="section-head flush"><h2>Đơn bán</h2><span className="scope-chip">12 gần nhất</span></div>{canReadOrders ? <ul className="clean-list">{orders.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/orders/${row.id}`}>{row.order_number}</Link><small>{row.site_name_snapshot} · {salesStateLabel(row.commercial_state)} / {salesStateLabel(row.fulfillment_state)} / {salesStateLabel(row.payment_state)}</small><small>{formatVnd(vnd(row.total_vnd))} · {date(row.created_at)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem đơn bán.</p>}{canReadOrders && !orders.length && <p className="empty-inline">Chưa có đơn bán.</p>}</section>
      <section className="card card-pad" id="deliveries"><div className="section-head flush"><h2>Giao hàng</h2><span className="scope-chip">12 gần nhất</span></div>{canReadDeliveries ? <ul className="clean-list">{deliveries.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/deliveries/${row.id}`}>{row.delivery_number}</Link><small>{row.site_name_snapshot} · {deliveryStateLabel(row.execution_state)} · {row.result_kind ? deliveryStateLabel(row.result_kind) : "Chưa có kết quả"} · {date(row.created_at)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem giao hàng.</p>}{canReadDeliveries && !deliveries.length && <p className="empty-inline">Chưa có phiếu giao.</p>}</section>
      <section className="card card-pad" id="receivables"><div className="section-head flush"><h2>Phải thu</h2>{canReadFinance && <Link className="code-link" href={`/api/customers/${customer.id}/debt-statement/pdf`}>Tải bảng đối chiếu</Link>}{canPostPayment && <Link className="code-link" href={`/admin/receivables?customer=${customer.id}`}>Ghi nhận thu tiền</Link>}</div>{canReadFinance ? <ul className="clean-list">{receivables.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/receivables/${row.id}`}>{financeSourceLabel(row.source_label)}</Link><small>{row.site_name ?? "Chưa gắn công trình"} · đến hạn {date(row.due_date)} · {financeStateLabel(row.state)}</small><small>Gốc {formatVnd(vnd(row.original_amount_vnd))} · còn {formatVnd(vnd(row.outstanding_amount_vnd))}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem phải thu.</p>}{canReadFinance && !receivables.length && <p className="empty-inline">Chưa có khoản phải thu.</p>}</section>
      <section className="card card-pad" id="payments"><div className="section-head flush"><h2>Thanh toán</h2><span className="scope-chip">20 gần nhất</span></div>{canReadFinance ? <ul className="clean-list">{payments.map((row) => <li key={row.id}><strong>{row.payment_number}</strong><small>{row.direction === "RECEIPT" ? "Thu" : "Chi"} · {formatVnd(vnd(row.amount_vnd))} · {date(row.effective_at)}</small><small>{financeStateLabel(row.posting_state)} · đối soát {financeStateLabel(row.reconciliation_state)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem thanh toán.</p>}{canReadFinance && !payments.length && <p className="empty-inline">Chưa có thanh toán.</p>}</section>
      <section className="card card-pad" id="documents"><div className="section-head flush"><h2>Tài liệu</h2><span className="scope-chip">Chứng từ gốc</span></div><ul className="clean-list">{documents.map((row) => <li key={row.id}><Link className="code-link" href={row.href}>{row.label}</Link><small>{row.kind} · nguồn nghiệp vụ · {date(row.at)}</small></li>)}</ul>{!documents.length && <p className="empty-inline">Chưa có tài liệu nghiệp vụ có thể truy vết.</p>}<p className="muted">Danh sách này mở bản ghi nguồn; chỉ hiển thị tài liệu đã được phát hành.</p></section>
    </div>
  </>;
}
