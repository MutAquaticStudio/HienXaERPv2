"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import {
  CircleAlert, ClipboardPlus, FileCheck2, HandCoins,
  PackageCheck, Send, ShieldCheck, Truck,
} from "lucide-react";

import { runCustomerPortalAction, type CustomerPortalActionState } from "@/app/customer/actions";
import { CustomerEvidenceUploader } from "@/components/customer-evidence-uploader";
import type { BrowserSupabaseConfig } from "@/lib/supabase/client";
import type { CustomerPortalSnapshot } from "@/modules/customer-portal/types";

type PageSection = "home" | "orders" | "debt" | "profile";

const issueLabels = {
  SHORT_DELIVERY: "Chưa nhận đủ hàng",
  WRONG_GOODS: "Hàng không đúng",
  NOT_RECEIVED: "Chưa nhận được hàng",
  DOCUMENT_INCORRECT: "Chứng từ chưa đúng",
  OTHER: "Khác",
} as const;

function money(value: string, currency = "VND") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency, maximumFractionDigits: currency === "VND" ? 0 : 2 }).format(amount);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    SENT: "Chờ phản hồi", ACCEPTED: "Đã đồng ý", FULFILLING: "Đang thực hiện",
    COMPLETED: "Hoàn tất", CONFIRMED: "Đã xác nhận", DELIVERED: "Đã giao",
    PARTIAL: "Giao một phần", OPEN: "Còn phải thanh toán", PARTIALLY_SETTLED: "Đã thanh toán một phần",
    SETTLED: "Đã thanh toán", SUBMITTED: "Đã gửi", UNDER_REVIEW: "Đang kiểm tra",
    MATCHED: "Đã đối chiếu", REJECTED: "Cần bổ sung", QUOTED: "Đã có báo giá", CLOSED: "Đã đóng",
    NEW_QUOTE: "Yêu cầu báo giá", REORDER: "Yêu cầu đặt lại", QUOTE_CHANGE: "Yêu cầu chỉnh sửa",
  };
  return labels[status] ?? status;
}

function SubmitButton({ label, tone = "primary" }: { label: string; tone?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button className={tone === "primary" ? "primary-button" : "secondary-button"} disabled={pending} type="submit">
    <Send aria-hidden="true" size={19} />{pending ? "ĐANG GỬI…" : label}
  </button>;
}

function CommandForm({
  kind, initialKey, label, tone, children,
}: {
  kind: string; initialKey: string; label: string; tone?: "primary" | "secondary"; children: ReactNode;
}) {
  const initialState: CustomerPortalActionState = { status: "idle", message: "", idempotencyKey: initialKey };
  const [state, action] = useActionState(runCustomerPortalAction, initialState);
  return <form action={action} className="customer-command-form" noValidate>
    <input name="kind" type="hidden" value={kind} />
    <input name="idempotencyKey" type="hidden" value={state.idempotencyKey} />
    {children}
    <SubmitButton label={label} tone={tone} />
    {state.message ? <p aria-live="polite" className={state.status === "error" ? "form-error" : "form-success"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}

function RequestQuoteForm({ data, initialKey }: { data: CustomerPortalSnapshot; initialKey: string }) {
  const [requestType, setRequestType] = useState<"NEW_QUOTE" | "REORDER" | "QUOTE_CHANGE">("NEW_QUOTE");
  const [customerSiteId, setCustomerSiteId] = useState(data.sites[0]?.id ?? "");
  const [materialId, setMaterialId] = useState(data.materials[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [sourceSalesOrderId, setSourceSalesOrderId] = useState(data.orders[0]?.id ?? "");
  const [sourceQuotationRevisionId, setSourceQuotationRevisionId] = useState(data.quotes[0]?.revisionId ?? "");
  const material = data.materials.find((item) => item.id === materialId) ?? data.materials[0];
  return <section className="customer-panel" aria-labelledby="customer-request-title">
    <div className="customer-panel-heading"><ClipboardPlus aria-hidden="true" size={24} /><div><h2 id="customer-request-title">Yêu cầu báo giá</h2><p>Gửi nhu cầu để Hiền Xa lập hoặc điều chỉnh báo giá. Giá hiện hành và tín dụng sẽ được kiểm tra lại trước khi gửi báo giá.</p></div></div>
    {data.sites.length && data.materials.length ? <CommandForm initialKey={initialKey} kind="customer.quote.request" label="Gửi yêu cầu">
      <label>Loại yêu cầu<select name="requestType" onChange={(event) => setRequestType(event.target.value as typeof requestType)} value={requestType}>
        <option value="NEW_QUOTE">Yêu cầu báo giá mới</option><option value="REORDER">Đặt lại theo đơn cũ</option><option value="QUOTE_CHANGE">Yêu cầu chỉnh sửa báo giá</option>
      </select></label>
      {requestType === "REORDER" ? <label>Đơn hàng nguồn<select name="sourceSalesOrderId" onChange={(event) => setSourceSalesOrderId(event.target.value)} required value={sourceSalesOrderId}>{data.orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} · {statusLabel(order.status)}</option>)}</select></label> : null}
      {requestType === "QUOTE_CHANGE" ? <label>Báo giá nguồn<select name="sourceQuotationRevisionId" onChange={(event) => setSourceQuotationRevisionId(event.target.value)} required value={sourceQuotationRevisionId}>{data.quotes.map((quote) => <option key={quote.revisionId} value={quote.revisionId}>{quote.quotationNumber} · phiên bản {quote.revisionNumber}</option>)}</select></label> : null}
      <label>Điểm giao<select name="customerSiteId" onChange={(event) => setCustomerSiteId(event.target.value)} required value={customerSiteId}>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
      <label>Vật liệu<select name="materialId" onChange={(event) => setMaterialId(event.target.value)} required value={materialId}>{data.materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <input name="uomId" type="hidden" value={material?.uomId ?? ""} />
      <label>Số lượng<input inputMode="decimal" min="0.001" name="quantity" onChange={(event) => setQuantity(event.target.value)} required step="any" type="number" value={quantity} /></label>
      <p className="customer-help">Đơn vị tính: <strong>{material?.uomSymbol ?? "—"}</strong>. Đây là yêu cầu mới; hệ thống không giữ im giá hoặc điều kiện cũ.</p>
      <label className="customer-field-wide">Ghi chú (không bắt buộc)<textarea maxLength={500} name="note" onChange={(event) => setNote(event.target.value)} placeholder="Thời gian giao hoặc yêu cầu cần lưu ý" rows={3} value={note} /></label>
    </CommandForm> : <p className="customer-empty">Chưa có điểm giao hoặc vật liệu phù hợp để gửi yêu cầu.</p>}
  </section>;
}

function DeliveryIssueForm({ deliveryId, initialKey }: { deliveryId: string; initialKey: string }) {
  const [category, setCategory] = useState<keyof typeof issueLabels>("SHORT_DELIVERY");
  const [description, setDescription] = useState("");
  return <CommandForm initialKey={initialKey} kind="customer.delivery.issue" label="Gửi phản hồi" tone="secondary">
    <input name="deliveryId" type="hidden" value={deliveryId} />
    <label>Lý do<select name="category" onChange={(event) => setCategory(event.target.value as keyof typeof issueLabels)} value={category}>{Object.entries(issueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Mô tả cụ thể<textarea minLength={10} name="description" onChange={(event) => setDescription(event.target.value)} required rows={3} value={description} /></label>
  </CommandForm>;
}

function Quotes({ data, keys }: { data: CustomerPortalSnapshot; keys: Record<string, string> }) {
  return <section className="customer-panel" aria-labelledby="customer-quotes-title">
    <div className="customer-panel-heading"><FileCheck2 aria-hidden="true" size={24} /><div><h2 id="customer-quotes-title">Báo giá của bạn</h2><p>Chỉ phiên bản đang hiệu lực được hiển thị. Đồng ý báo giá không tự tạo đơn bán.</p></div></div>
    {data.quotes.length ? <div className="customer-card-list">{data.quotes.map((quote) => <article className="customer-card" key={quote.revisionId}>
      <header><div><strong>{quote.quotationNumber}</strong><span>Phiên bản {quote.revisionNumber} · đến {quote.validUntil}</span></div><b className="customer-status">{statusLabel(quote.status)}</b></header>
      <ul className="customer-lines">{quote.lines.map((line) => <li key={line.id}><span>{line.materialName} · {line.quantity} {line.uomSymbol}</span><strong>{money(line.lineAmount, quote.currency)}</strong></li>)}</ul>
      <div className="customer-total"><span>Tổng báo giá</span><strong>{money(quote.totalAmount, quote.currency)}</strong></div>
      {quote.notes ? <p className="customer-note">{quote.notes}</p> : null}
      {quote.status === "SENT" ? <CommandForm initialKey={keys[`quote:${quote.revisionId}`] ?? crypto.randomUUID()} kind="customer.quote.accept" label="Đồng ý báo giá"><input name="revisionId" type="hidden" value={quote.revisionId} /></CommandForm> : null}
    </article>)}</div> : <p className="customer-empty">Chưa có báo giá đang hiệu lực.</p>}
  </section>;
}

function Deliveries({ data, keys }: { data: CustomerPortalSnapshot; keys: Record<string, string> }) {
  return <section className="customer-panel" aria-labelledby="customer-delivery-title">
    <div className="customer-panel-heading"><Truck aria-hidden="true" size={24} /><div><h2 id="customer-delivery-title">Giao hàng</h2><p>Số lượng thực tế được đọc từ phiếu giao đã ghi nhận. Xác nhận hoặc phản hồi không sửa số liệu gốc.</p></div></div>
    {data.deliveries.length ? <div className="customer-card-list">{data.deliveries.map((delivery) => <article className="customer-card" key={delivery.id}>
      <header><div><strong>{delivery.deliveryNumber}</strong><span>{delivery.orderNumber} · {delivery.siteName ?? "Điểm giao chưa xác định"}</span></div><b className="customer-status">{statusLabel(delivery.status)}</b></header>
      <p className="customer-date">Dự kiến: {delivery.scheduledDate}{delivery.deliveredAt ? ` · đã giao ${new Date(delivery.deliveredAt).toLocaleDateString("vi-VN")}` : ""}</p>
      <div className="customer-delivery-progress"><strong>Tiến độ giao hàng</strong><span>{delivery.progressMessage}</span><small>{delivery.etaMessage}</small></div>
      <ul className="customer-lines">{delivery.lines.map((line) => <li key={line.id}><span>{line.materialName}</span><strong>{line.actualQuantity ?? line.plannedQuantity} / {line.plannedQuantity} {line.uomSymbol}</strong></li>)}</ul>
      {delivery.canAcknowledge && !delivery.acknowledgementId ? <CommandForm initialKey={keys[`ack:${delivery.id}`] ?? crypto.randomUUID()} kind="customer.delivery.acknowledge" label="Xác nhận đã nhận đủ"><input name="deliveryId" type="hidden" value={delivery.id} /></CommandForm> : delivery.acknowledgementId ? <p className="form-success">Đã xác nhận nhận hàng.</p> : null}
      {delivery.canAcknowledge ? <details className="customer-details"><summary>Báo vấn đề giao hàng</summary><DeliveryIssueForm deliveryId={delivery.id} initialKey={keys[`issue:${delivery.id}`] ?? crypto.randomUUID()} /></details> : null}
    </article>)}</div> : <p className="customer-empty">Chưa có phiếu giao nào cần theo dõi.</p>}
  </section>;
}

function PaymentNotice({ data, config, initialKey }: { data: CustomerPortalSnapshot; config: BrowserSupabaseConfig | null; initialKey: string }) {
  const [evidenceStoragePath, setEvidenceStoragePath] = useState("");
  const [amount, setAmount] = useState("");
  const [transferredOn, setTransferredOn] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [note, setNote] = useState("");
  return <section className="customer-panel" aria-labelledby="customer-payment-title">
    <div className="customer-panel-heading"><HandCoins aria-hidden="true" size={24} /><div><h2 id="customer-payment-title">Thông báo thanh toán</h2><p>Gửi chứng từ để đối chiếu. Thông báo không tạo phiếu thu, phân bổ hoặc điều chỉnh công nợ.</p></div></div>
    <CommandForm initialKey={initialKey} kind="customer.payment.notice" label="Gửi thông báo thanh toán">
      <label>Số tiền đã chuyển<input inputMode="decimal" min="1" name="amount" onChange={(event) => setAmount(event.target.value)} required step="0.01" type="number" value={amount} /></label>
      <label>Ngày chuyển khoản<input name="transferredOn" onChange={(event) => setTransferredOn(event.target.value)} required type="date" value={transferredOn} /></label>
      <label>Mã giao dịch (không bắt buộc)<input maxLength={120} name="bankReference" onChange={(event) => setBankReference(event.target.value)} value={bankReference} /></label>
      <input name="evidenceStoragePath" type="hidden" value={evidenceStoragePath} />
      <CustomerEvidenceUploader config={config} onUploaded={setEvidenceStoragePath} />
      <label className="customer-field-wide">Ghi chú (không bắt buộc)<textarea maxLength={500} name="note" onChange={(event) => setNote(event.target.value)} rows={3} value={note} /></label>
    </CommandForm>
    {data.paymentNotices.length ? <ul className="customer-history">{data.paymentNotices.map((notice) => <li key={notice.id}><span>{notice.noticeNumber} · {notice.transferredOn}</span><strong>{money(notice.amount)} · {statusLabel(notice.status)}</strong></li>)}</ul> : null}
  </section>;
}

function Orders({ data }: { data: CustomerPortalSnapshot }) {
  return <section className="customer-panel" aria-labelledby="customer-orders-title">
    <div className="customer-panel-heading"><PackageCheck aria-hidden="true" size={24} /><div><h1 id="customer-orders-title">Đơn hàng</h1><p>Theo dõi đơn bán đã được Hiền Xa xử lý; không hiển thị dữ liệu vận hành nội bộ.</p></div></div>
    {data.orders.length ? <div className="customer-card-list">{data.orders.map((order) => <article className="customer-card" key={order.id}><header><div><strong>{order.orderNumber}</strong><span>{order.siteName ?? "Điểm giao chưa xác định"}</span></div><b className="customer-status">{statusLabel(order.status)}</b></header><ul className="customer-lines">{order.lines.map((line) => <li key={line.id}><span>{line.materialName}</span><strong>{line.quantity} {line.uomSymbol}</strong></li>)}</ul><div className="customer-total"><span>Giá trị đơn</span><strong>{money(order.totalAmount, order.currency)}</strong></div></article>)}</div> : <p className="customer-empty">Chưa có đơn hàng nào.</p>}
  </section>;
}

function Debts({ data }: { data: CustomerPortalSnapshot }) {
  const total = useMemo(() => data.debts.reduce((sum, debt) => sum + Number(debt.outstandingAmount), 0), [data.debts]);
  return <section className="customer-panel" aria-labelledby="customer-debt-title">
    <div className="customer-panel-heading"><ShieldCheck aria-hidden="true" size={24} /><div><h1 id="customer-debt-title">Công nợ</h1><p>Số liệu chỉ đọc, lấy trực tiếp từ phải thu đã ghi nhận (P8).</p></div></div>
    <div className="customer-debt-total"><span>Tổng còn phải thanh toán</span><strong>{money(String(total))}</strong></div>
    {data.debts.length ? <div className="customer-card-list">{data.debts.map((debt) => <article className="customer-card" key={debt.id}><header><div><strong>{debt.documentNumber}</strong><span>{debt.orderNumber} · hạn {debt.dueDate}</span></div><b className="customer-status">{statusLabel(debt.status)}</b></header><div className="customer-total"><span>Còn phải thanh toán</span><strong>{money(debt.outstandingAmount, debt.currency)}</strong></div></article>)}</div> : <p className="customer-empty">Không có phải thu đang mở.</p>}
  </section>;
}

export function CustomerPortalWorkspace({ data, initialKeys, section, supabaseConfig }: { data: CustomerPortalSnapshot; initialKeys: Record<string, string>; section: PageSection; supabaseConfig: BrowserSupabaseConfig | null }) {
  if (section === "orders") return <><Orders data={data} /><Deliveries data={data} keys={initialKeys} /></>;
  if (section === "debt") return <><Debts data={data} /><PaymentNotice config={supabaseConfig} data={data} initialKey={initialKeys.payment ?? crypto.randomUUID()} /></>;
  if (section === "profile") return <section className="customer-panel customer-profile"><div className="customer-panel-heading"><CircleAlert aria-hidden="true" size={24} /><div><h1>Hồ sơ portal</h1><p>{data.customerName} · quyền {data.portalRole === "BILLING" ? "thông báo thanh toán" : "liên hệ"}.</p></div></div><p className="customer-help">Tài khoản này chỉ xem dữ liệu của chính hồ sơ khách hàng được liên kết. Nhân sự nội bộ không có membership không thể dùng cổng này để xem thay khách hàng.</p><h2>Lịch sử yêu cầu</h2>{data.quoteRequests.length ? <ul className="customer-history">{data.quoteRequests.map((request) => <li key={request.id}><span>{request.requestNumber} · {statusLabel(request.requestType)}</span><strong>{statusLabel(request.status)}</strong></li>)}</ul> : <p className="customer-empty">Chưa có yêu cầu nào được gửi từ portal.</p>}</section>;
  return <><section className="customer-hero"><p>Xin chào</p><h1>{data.customerName}</h1><span>Chủ động xem báo giá, đơn hàng, giao hàng và công nợ của đơn vị bạn.</span></section><section className="customer-metrics" aria-label="Tổng quan khách hàng"><div><strong>{data.quotes.filter((quote) => quote.status === "SENT").length}</strong><span>Báo giá chờ phản hồi</span></div><div><strong>{data.deliveries.filter((delivery) => delivery.canAcknowledge && !delivery.acknowledgementId).length}</strong><span>Phiếu giao cần xem</span></div><div><strong>{money(String(data.debts.reduce((sum, debt) => sum + Number(debt.outstandingAmount), 0)))}</strong><span>Còn phải thanh toán</span></div></section><Quotes data={data} keys={initialKeys} /><RequestQuoteForm data={data} initialKey={initialKeys.request ?? crypto.randomUUID()} /></>;
}
