import { ReliableCommandForm, CommandRecoveryNotice } from "@/components/reliable-command-form";
import { CancelDocumentForm } from "@/components/documents/cancel-document-form";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionNotice } from "@/components/sales/action-notice";
import { PurchaseEvidenceUpload } from "@/components/purchasing/purchase-evidence-upload";
import { ButtonLink } from "@/components/ui/button-link";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatQuantity } from "@/lib/core/quantity";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { receivePurchaseOrderWithOutcomeAction, verifySupplierFulfillmentWithOutcomeAction } from "@/modules/inventory/actions";
import { cancelPurchaseOrderAction, confirmPurchaseOrderAction } from "@/modules/purchasing/actions";
import { purchaseStateLabel, purchaseStateTone } from "@/modules/purchasing/presentation";

type PurchaseOrder = { id: string; purchase_order_number: string; supplier_name_snapshot: string; destination_type: string; destination_name_snapshot: string; destination_address_snapshot: string; source_sales_order_id: string | null; state: string; expected_at: string | null; total_cost_vnd: string | null };
type PurchaseLine = { id: string; linked_sales_order_line_id: string | null; material_name_snapshot: string; quantity: string; ordered_uom_id: string; unit_cost_vnd: string | null; line_total_cost_vnd: string | null; price_source_type: string | null };
type Allocation = { purchase_order_line_id: string; supply_mode: string; allocated_base_quantity: string; version: number };
type Receipt = { id: string; receipt_number: string; received_at: string; received_base_quantity: string; payable_amount_vnd: string | null };
type Fulfillment = { id: string; supplier_reference: string | null; verified_at: string; supplier_base_quantity: string; payable_amount_vnd: string | null };
type LineProgress = { purchase_order_line_id: string; received_quantity: string; supplier_quantity: string };
type EvidenceRef = { id: string; evidence_object_id: string | null };

export default async function PurchaseOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const access = await requireInternalPermission("purchasing.read");
  const { id } = await params;
  const supabase = await createServerSupabase();
  const [orderResult, lineResult, uomResult, receiptResult, fulfillmentResult, progressResult, termsResult] = await Promise.all([
    supabase.from("purchase_order_read").select("id, purchase_order_number, supplier_name_snapshot, destination_type, destination_name_snapshot, destination_address_snapshot, source_sales_order_id, state, expected_at, total_cost_vnd").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
    supabase.from("purchase_order_line_read").select("id, linked_sales_order_line_id, material_name_snapshot, quantity, ordered_uom_id, unit_cost_vnd, line_total_cost_vnd, price_source_type").eq("purchase_order_id", id).order("line_number"),
    supabase.from("units_of_measure").select("id, symbol"),
    supabase.from("purchase_receipt_read").select("id, receipt_number, received_at, received_base_quantity, payable_amount_vnd").eq("purchase_order_id", id).order("received_at", { ascending: false }),
    supabase.from("supplier_fulfillment_read").select("id, supplier_reference, verified_at, supplier_base_quantity, payable_amount_vnd").eq("purchase_order_id", id).order("verified_at", { ascending: false }),
    supabase.from("purchase_order_line_progress_read").select("purchase_order_line_id, received_quantity, supplier_quantity").eq("purchase_order_id", id),
    supabase.from("purchase_orders").select("commercial_terms").eq("id", id).eq("branch_id", access.branchId).maybeSingle(),
  ]);
  if (!orderResult.data) notFound();
  if (termsResult.error || !termsResult.data) throw new Error("Không thể tải điều khoản đơn mua.");
  const order = orderResult.data as PurchaseOrder;
  const lines = (lineResult.data ?? []) as PurchaseLine[];
  const receipts = (receiptResult.data ?? []) as Receipt[];
  const fulfillments = (fulfillmentResult.data ?? []) as Fulfillment[];
  const { data: allocationData } = lines.length ? await supabase.from("supply_allocations").select("purchase_order_line_id, supply_mode, allocated_base_quantity, version").in("purchase_order_line_id", lines.map((line) => line.id)) : { data: [] };
  const allocations = (allocationData ?? []) as Allocation[];
  const receiptEvidenceById = new Map<string, string>();
  const fulfillmentEvidenceById = new Map<string, string>();
  let evidenceLoadFailed = false;
  if (access.permissions.has("evidence.manage")) {
    const [receiptEvidenceResult, fulfillmentEvidenceResult] = await Promise.all([
      supabase.from("purchase_receipts").select("id,evidence_object_id").eq("purchase_order_id", id).eq("branch_id", access.branchId),
      supabase.from("supplier_fulfillments").select("id,evidence_object_id").eq("purchase_order_id", id).eq("branch_id", access.branchId),
    ]);
    evidenceLoadFailed = Boolean(receiptEvidenceResult.error || fulfillmentEvidenceResult.error);
    if (!evidenceLoadFailed) {
      for (const row of (receiptEvidenceResult.data ?? []) as EvidenceRef[]) if (row.evidence_object_id) receiptEvidenceById.set(row.id, row.evidence_object_id);
      for (const row of (fulfillmentEvidenceResult.data ?? []) as EvidenceRef[]) if (row.evidence_object_id) fulfillmentEvidenceById.set(row.id, row.evidence_object_id);
    }
  }
  const symbols = new Map((uomResult.data ?? []).map((uom) => [uom.id, uom.symbol]));
  const progressReady = !lineResult.error && !progressResult.error && progressResult.data?.length === lines.length;
  const progressByLine = new Map(((progressResult.data ?? []) as LineProgress[]).map((row) => [row.purchase_order_line_id, row]));
  const openLines = progressReady ? lines.flatMap((line, index) => {
    const progress = progressByLine.get(line.id);
    if (!progress) return [];
    const used = order.destination_type === "WAREHOUSE" ? progress.received_quantity : progress.supplier_quantity;
    const remaining = new Decimal(line.quantity).minus(used);
    return remaining.gt(0) ? [{ line, index, remaining: remaining.toString() }] : [];
  }) : [];
  const query = await searchParams;
  const payable = [...receipts, ...fulfillments].reduce((sum, row) => sum + BigInt(row.payable_amount_vnd ?? 0), 0n);
  return <>
    <header className="page-heading"><div><p className="eyebrow">Đơn mua</p><h1>{order.purchase_order_number}</h1><p className="lede">{order.supplier_name_snapshot} · {purchaseStateLabel(order.destination_type)}</p></div><ButtonLink href="/admin/purchase-orders" variant="secondary">Về danh sách</ButtonLink></header>
    <ActionNotice notice={query.notice} error={query.error} />
    <CommandRecoveryNotice scope={access.authUserId + ":" + access.branchId + ":" + order.id} command="receive_purchase_order" />
    <CommandRecoveryNotice scope={access.authUserId + ":" + access.branchId + ":" + order.id} command="verify_supplier_fulfillment" />
    <section className="axis-grid"><article className="card axis-card"><span>Trạng thái đơn mua</span><StatusBadge tone={purchaseStateTone(order.state)}>{purchaseStateLabel(order.state)}</StatusBadge></article><article className="card axis-card"><span>Đã nhận / NCC giao</span><strong>{receipts.length + fulfillments.length} lần xác minh</strong></article><article className="card axis-card"><span>Phải trả đã phát sinh</span><strong>{access.permissions.has("finance.ap.read") ? formatVnd(vnd(payable)) : "Theo quyền"}</strong></article></section>
    <div className="two-column"><section className="card card-pad"><h2>Điểm đến & dòng mua</h2><dl className="detail-grid"><div className="detail-item"><dt>Điểm đến</dt><dd>{order.destination_name_snapshot}</dd></div><div className="detail-item"><dt>Dự kiến</dt><dd>{order.expected_at ? formatBusinessDateTime(order.expected_at) : "Chưa hẹn"}</dd></div><div className="detail-item field-full"><dt>Địa chỉ nhận đã lưu</dt><dd>{order.destination_address_snapshot}</dd></div><div className="detail-item"><dt>Điều khoản mua</dt><dd>{termsResult.data.commercial_terms || "Chưa ghi"}</dd></div><div className="detail-item"><dt>Tổng giá mua</dt><dd>{order.total_cost_vnd == null ? "Không có quyền xem" : formatVnd(vnd(order.total_cost_vnd))}</dd></div>{order.source_sales_order_id && <div className="detail-item"><dt>Đơn bán nguồn</dt><dd>{access.permissions.has("orders.read") ? <Link className="code-link mono" href={`/admin/orders/${order.source_sales_order_id}`}>Mở đơn bán</Link> : <span className="muted">Không có quyền xem đơn bán</span>}</dd></div>}</dl><div className="table-wrap"><table><thead><tr><th>Vật tư</th><th>Số lượng</th><th>Giá mua</th><th>Thành tiền</th><th>Phân nguồn</th></tr></thead><tbody>{lines.map((line) => { const allocation = allocations.find((row) => row.purchase_order_line_id === line.id); return <tr key={line.id}><td>{line.material_name_snapshot}</td><td>{formatQuantity(line.quantity)} {symbols.get(line.ordered_uom_id)}</td><td>{line.unit_cost_vnd == null ? "Ẩn theo quyền" : formatVnd(vnd(line.unit_cost_vnd))}</td><td>{line.line_total_cost_vnd == null ? "Ẩn theo quyền" : formatVnd(vnd(line.line_total_cost_vnd))}</td><td>{allocation ? `${purchaseStateLabel(allocation.supply_mode)} · ${formatQuantity(allocation.allocated_base_quantity)} đơn vị cơ sở` : "Chưa gắn dòng bán"}</td></tr>; })}</tbody></table></div><div className="source-history"><h3>Lịch sử nhận hàng và giao thẳng</h3>{receipts.map((row) => <p key={row.id}><strong>{row.receipt_number}</strong><span>Nhận {formatQuantity(row.received_base_quantity)} đơn vị cơ sở · {row.payable_amount_vnd ? formatVnd(vnd(row.payable_amount_vnd)) : "Giá trị ẩn"}</span></p>)}{fulfillments.map((row) => <p key={row.id}><strong>{row.supplier_reference ?? "NCC giao thẳng"}</strong><span>NCC xác minh {formatQuantity(row.supplier_base_quantity)} đơn vị cơ sở · {row.payable_amount_vnd ? formatVnd(vnd(row.payable_amount_vnd)) : "Giá trị ẩn"}</span></p>)}{receipts.length + fulfillments.length === 0 && <p className="muted">Chưa có phiếu nhập kho hoặc xác minh nhà cung cấp giao thẳng.</p>}</div>{access.permissions.has("evidence.manage") && receipts.length + fulfillments.length > 0 && <div className="source-history"><h3>Minh chứng nguồn mua</h3>{evidenceLoadFailed ? <p className="muted">Không tải được minh chứng. Hãy tải lại trang.</p> : <>{receipts.map((row) => <p key={row.id}><strong>{row.receipt_number}</strong>{receiptEvidenceById.has(row.id) ? <Link href={`/api/purchasing/evidence/${receiptEvidenceById.get(row.id)}/signed`} target="_blank" rel="noopener noreferrer">Xem tệp đã gắn</Link> : <span className="muted">Chưa gắn tệp</span>}</p>)}{fulfillments.map((row) => <p key={row.id}><strong>{row.supplier_reference ?? row.id.slice(0, 8)}</strong>{fulfillmentEvidenceById.has(row.id) ? <Link href={`/api/purchasing/evidence/${fulfillmentEvidenceById.get(row.id)}/signed`} target="_blank" rel="noopener noreferrer">Xem tệp đã gắn</Link> : <span className="muted">Chưa gắn tệp</span>}</p>)}</>}</div>}</section><aside className="card card-pad command-panel"><h2>Hành động tiếp theo</h2>
      {order.state === "DRAFT" && access.permissions.has("purchasing.create") && access.permissions.has("purchasing.price.read") && <Link className="button button-primary action-full" href={`/admin/purchase-orders/${order.id}/edit`}>Sửa bản nháp</Link>}
      {order.state === "DRAFT" && access.permissions.has("purchasing.confirm") && <form action={confirmPurchaseOrderAction}><input type="hidden" name="entityId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><button className="button button-primary action-full" type="submit">Xác nhận đơn mua</button></form>}
      {order.state === "CONFIRMED" && access.permissions.has("inventory.receive") && !progressReady && <p className="muted">Không tải được lượng còn lại từng dòng. Tải lại trang trước khi ghi nhận.</p>}
      {order.state === "CONFIRMED" && access.permissions.has("inventory.receive") && progressReady && openLines.length === 0 && <p className="muted">Các dòng đã đủ lượng. Tải lại trang để cập nhật trạng thái đơn mua.</p>}
      {order.state === "CONFIRMED" && order.destination_type === "WAREHOUSE" && access.permissions.has("inventory.receive") && openLines.length > 0 && <ReliableCommandForm className="command-panel" action={receivePurchaseOrderWithOutcomeAction} command="receive_purchase_order" scope={access.authUserId + ":" + access.branchId + ":" + order.id} operationId={randomUUID()}><input type="hidden" name="purchaseOrderId" value={order.id} /><input type="hidden" name="receivedAt" value={new Date().toISOString()} /><input type="hidden" name="operationId" value={randomUUID()} /><strong>Nhận hàng theo dòng</strong><p className="muted">Để trống dòng chưa nhận trong lần này.</p>{openLines.map(({ line, index, remaining }) => <div className="field" key={line.id}><input type="hidden" name="purchaseOrderLineId" value={line.id} /><label htmlFor={`receivedQuantity-${line.id}`}>Dòng {index + 1} · {line.material_name_snapshot} ({symbols.get(line.ordered_uom_id)}) · còn {formatQuantity(remaining)}</label><input id={`receivedQuantity-${line.id}`} name="quantity" inputMode="decimal" placeholder={`Tối đa ${formatQuantity(remaining)}`} /></div>)}{access.permissions.has("evidence.manage") && <PurchaseEvidenceUpload purchaseOrderId={order.id} />}<button className="button button-primary action-full" type="submit">Xác nhận nhận hàng</button></ReliableCommandForm>}
      {order.state === "CONFIRMED" && order.destination_type === "CUSTOMER_SITE" && access.permissions.has("inventory.receive") && openLines.length > 0 && <ReliableCommandForm className="command-panel" action={verifySupplierFulfillmentWithOutcomeAction} command="verify_supplier_fulfillment" scope={access.authUserId + ":" + access.branchId + ":" + order.id} operationId={randomUUID()}><input type="hidden" name="purchaseOrderId" value={order.id} /><input type="hidden" name="operationId" value={randomUUID()} /><strong>NCC giao theo dòng</strong><p className="muted">Để trống dòng chưa được xác minh trong lần này.</p>{openLines.map(({ line, index, remaining }) => <div className="field" key={line.id}><input type="hidden" name="purchaseOrderLineId" value={line.id} /><label htmlFor={`supplierQuantity-${line.id}`}>Dòng {index + 1} · {line.material_name_snapshot} ({symbols.get(line.ordered_uom_id)}) · còn {formatQuantity(remaining)}</label><input id={`supplierQuantity-${line.id}`} name="quantity" inputMode="decimal" placeholder={`Tối đa ${formatQuantity(remaining)}`} /></div>)}<div className="field"><label htmlFor="supplierReference">Mã phiếu / đầu mối NCC</label><input id="supplierReference" name="supplierReference" /></div>{access.permissions.has("evidence.manage") && <PurchaseEvidenceUpload purchaseOrderId={order.id} />}<button className="button button-primary action-full" type="submit">Xác minh NCC giao</button></ReliableCommandForm>}
      {["DRAFT", "CONFIRMED"].includes(order.state) && receipts.length + fulfillments.length === 0 && access.permissions.has("purchasing.cancel") && <CancelDocumentForm entityId={order.id} operationId={randomUUID()} state={order.state} label="Hủy đơn mua" action={cancelPurchaseOrderAction} />}
      {order.state === "CLOSED" && <p className="muted">Đã hoàn tất lượng mua. Hóa đơn NCC đến sau chỉ dùng đối soát, không ghi công nợ phải trả lần hai.</p>}
    </aside></div>
  </>;
}
