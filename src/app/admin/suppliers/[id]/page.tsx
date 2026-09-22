import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

type PurchaseRow = { id: string; purchase_order_number: string; state: string; destination_type: string; destination_name_snapshot: string; total_cost_vnd?: string; expected_at: string | null; created_at: string };
type ReceiptRow = { id: string; purchase_order_id: string; receipt_number: string; received_at: string; received_base_quantity: string };
type FulfillmentRow = { id: string; purchase_order_id: string; supplier_reference: string | null; verified_at: string; supplier_base_quantity: string };
type PayableRow = { id: string; source_label: string; original_amount_vnd: string; outstanding_amount_vnd: string; due_date: string; state: string; recorded_at: string };
type PaymentRow = { id: string; payment_number: string; direction: string; amount_vnd: string; effective_at: string; posting_state: string; reconciliation_state: string };

function date(value: string) {
  return new Intl.DateTimeFormat("vi-VN").format(new Date(value));
}

export default async function SupplierDetailPage({ params }: PageProps<"/admin/suppliers/[id]">) {
  const access = await requireInternalPermission("suppliers.read");
  const { id } = await params;
  const canReadPurchasing = access.permissions.has("purchasing.read");
  const canReadPurchasePrice = access.permissions.has("purchasing.price.read");
  const canReadFinance = access.permissions.has("finance.ap.read");
  const canCreatePurchase = access.permissions.has("purchasing.create");
  const canPostPayment = canReadFinance && access.permissions.has("finance.payment.post");
  const supabase = await createServerSupabase();
  const purchaseFields = `id, purchase_order_number, state, destination_type, destination_name_snapshot, expected_at, created_at${canReadPurchasePrice ? ", total_cost_vnd" : ""}`;
  const [supplierResult, contactsResult, purchaseResult, payableResult, paymentResult] = await Promise.all([
    supabase.from("suppliers").select("id, code, name, phone, email, tax_code, address_text, payment_terms_days, active").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("supplier_contacts").select("id, name, phone, email, role_label, active").eq("supplier_id", id).eq("active", true).order("name").limit(50),
    canReadPurchasing ? supabase.from("purchase_order_read").select(purchaseFields).eq("branch_id", access.branchId).eq("supplier_id", id).order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    canReadFinance ? supabase.from("payable_read").select("id, source_label, original_amount_vnd, outstanding_amount_vnd, due_date, state, recorded_at").eq("branch_id", access.branchId).eq("supplier_id", id).order("recorded_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    canReadFinance ? supabase.from("payment_read").select("id, payment_number, direction, amount_vnd, effective_at, posting_state, reconciliation_state").eq("branch_id", access.branchId).eq("supplier_id", id).order("effective_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
  ]);
  if (!supplierResult.data) notFound();
  const supplier = supplierResult.data;
  const purchases = (purchaseResult.data ?? []) as unknown as PurchaseRow[];
  const purchaseIds = purchases.map((row) => row.id);
  const [receiptResult, fulfillmentResult] = canReadPurchasing && purchaseIds.length ? await Promise.all([
    supabase.from("purchase_receipt_read").select("id, purchase_order_id, receipt_number, received_at, received_base_quantity").eq("branch_id", access.branchId).in("purchase_order_id", purchaseIds).order("received_at", { ascending: false }).limit(20),
    supabase.from("supplier_fulfillment_read").select("id, purchase_order_id, supplier_reference, verified_at, supplier_base_quantity").eq("branch_id", access.branchId).in("purchase_order_id", purchaseIds).order("verified_at", { ascending: false }).limit(20),
  ]) : [{ data: [] }, { data: [] }];
  const receipts = (receiptResult.data ?? []) as unknown as ReceiptRow[];
  const fulfillments = (fulfillmentResult.data ?? []) as unknown as FulfillmentRow[];
  const payables = (payableResult.data ?? []) as unknown as PayableRow[];
  const payments = (paymentResult.data ?? []) as unknown as PaymentRow[];
  const purchaseNumbers = new Map(purchases.map((row) => [row.id, row.purchase_order_number]));
  const outstanding = payables.reduce((total, row) => total + BigInt(row.outstanding_amount_vnd), 0n);

  return <>
    <header className="page-heading"><div><p className="eyebrow">Nhà cung cấp · {supplier.code}</p><h1>{supplier.name}</h1><p className="lede">{supplier.phone ?? "Chưa có điện thoại"} · {supplier.address_text ?? "Chưa có địa chỉ"}</p></div><div className="form-actions">{canCreatePurchase && <Link className="button button-primary" href={`/admin/purchase-orders/new?supplier=${supplier.id}`}>Tạo đơn mua</Link>}{canPostPayment && <Link className="button button-secondary" href={`/admin/payables?supplier=${supplier.id}`}>Ghi nhận chi tiền</Link>}<StatusBadge tone={supplier.active ? "success" : "danger"}>{supplier.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></div></header>
    <nav className="filter-bar" aria-label="Ngữ cảnh nhà cung cấp"><a className="code-link" href="#profile">Hồ sơ</a><a className="code-link" href="#purchase-orders">Đơn mua</a><a className="code-link" href="#receipts">Nhập kho</a><a className="code-link" href="#direct-fulfillments">Giao thẳng</a><a className="code-link" href="#payables">Phải trả</a><a className="code-link" href="#payments">Thanh toán</a></nav>
    <section className="metric-grid"><article className="card metric-card"><span className="metric-label">Đơn mua gần nhất</span><strong className="metric-value">{canReadPurchasing ? purchases.length : "—"}</strong></article><article className="card metric-card"><span className="metric-label">Phiếu nhập / giao thẳng</span><strong className="metric-value">{canReadPurchasing ? `${receipts.length} / ${fulfillments.length}` : "—"}</strong></article><article className="card metric-card"><span className="metric-label">AP đang hiển thị</span><strong className="metric-value">{canReadFinance ? formatVnd(vnd(outstanding)) : "Không có quyền"}</strong></article><article className="card metric-card"><span className="metric-label">Điều khoản</span><strong className="metric-value">{supplier.payment_terms_days} ngày</strong></article></section>
    <div className="two-column">
      <section className="card card-pad" id="profile"><h2>Hồ sơ</h2><dl className="detail-grid"><div className="detail-item"><dt>Email</dt><dd>{supplier.email ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Mã số thuế</dt><dd>{supplier.tax_code ?? "Chưa có"}</dd></div><div className="detail-item"><dt>Điều khoản</dt><dd>{supplier.payment_terms_days} ngày</dd></div></dl><h3>Đầu mối liên hệ</h3><ul className="clean-list">{(contactsResult.data ?? []).map((contact) => <li key={contact.id}><strong>{contact.name}</strong><small>{contact.role_label ?? "Đầu mối"} · {contact.phone ?? contact.email ?? "Chưa có liên hệ"}</small></li>)}</ul>{!(contactsResult.data ?? []).length && <p className="empty-inline">Chưa có đầu mối đang hoạt động.</p>}</section>
      <section className="card card-pad" id="purchase-orders"><div className="section-head flush"><h2>Đơn mua</h2><span className="scope-chip">20 gần nhất</span></div>{canReadPurchasing ? <ul className="clean-list">{purchases.map((row) => <li key={row.id}><Link className="code-link mono" href={`/admin/purchase-orders/${row.id}`}>{row.purchase_order_number}</Link><small>{row.state} · {row.destination_type === "WAREHOUSE" ? "Về kho" : "Giao thẳng"} · {row.destination_name_snapshot}</small><small>{row.expected_at ? `Dự kiến ${date(row.expected_at)}` : "Chưa hẹn"}{canReadPurchasePrice && row.total_cost_vnd != null ? ` · ${formatVnd(vnd(row.total_cost_vnd))}` : ""}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem đơn mua.</p>}{canReadPurchasing && !purchases.length && <p className="empty-inline">Chưa có đơn mua.</p>}</section>
      <section className="card card-pad" id="receipts"><div className="section-head flush"><h2>Nhập kho</h2><span className="scope-chip">20 gần nhất</span></div>{canReadPurchasing ? <ul className="clean-list">{receipts.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/purchase-orders/${row.purchase_order_id}`}>{row.receipt_number}</Link><small>{purchaseNumbers.get(row.purchase_order_id) ?? "Đơn mua"} · {row.received_base_quantity} base · {date(row.received_at)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem phiếu nhập.</p>}{canReadPurchasing && !receipts.length && <p className="empty-inline">Chưa có phiếu nhập kho.</p>}</section>
      <section className="card card-pad" id="direct-fulfillments"><div className="section-head flush"><h2>Giao thẳng</h2><span className="scope-chip">20 gần nhất</span></div>{canReadPurchasing ? <ul className="clean-list">{fulfillments.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/purchase-orders/${row.purchase_order_id}`}>{row.supplier_reference ?? purchaseNumbers.get(row.purchase_order_id) ?? "Fulfillment"}</Link><small>{purchaseNumbers.get(row.purchase_order_id) ?? "Đơn mua"} · {row.supplier_base_quantity} base · xác minh {date(row.verified_at)}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem giao thẳng.</p>}{canReadPurchasing && !fulfillments.length && <p className="empty-inline">Chưa có giao thẳng đã xác minh.</p>}</section>
      <section className="card card-pad" id="payables"><div className="section-head flush"><h2>Phải trả</h2>{canPostPayment && <Link className="code-link" href={`/admin/payables?supplier=${supplier.id}`}>Ghi nhận chi tiền</Link>}</div>{canReadFinance ? <ul className="clean-list">{payables.map((row) => <li key={row.id}><Link className="code-link" href={`/admin/payables/${row.id}`}>{row.source_label}</Link><small>Gốc {formatVnd(vnd(row.original_amount_vnd))} · còn {formatVnd(vnd(row.outstanding_amount_vnd))}</small><small>Đến hạn {date(row.due_date)} · {row.state}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem phải trả.</p>}{canReadFinance && !payables.length && <p className="empty-inline">Chưa có khoản phải trả.</p>}</section>
      <section className="card card-pad" id="payments"><div className="section-head flush"><h2>Thanh toán</h2><span className="scope-chip">20 gần nhất</span></div>{canReadFinance ? <ul className="clean-list">{payments.map((row) => <li key={row.id}><strong>{row.payment_number}</strong><small>{row.direction === "DISBURSEMENT" ? "Chi" : "Thu"} · {formatVnd(vnd(row.amount_vnd))} · {date(row.effective_at)}</small><small>{row.posting_state} · đối soát {row.reconciliation_state}</small></li>)}</ul> : <p className="muted">Bạn không có quyền xem thanh toán.</p>}{canReadFinance && !payments.length && <p className="empty-inline">Chưa có thanh toán.</p>}</section>
    </div>
  </>;
}
