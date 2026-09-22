"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import {
  approveInvoiceBusinessAction,
  cancelInvoiceDraftAction,
  createInvoiceAdjustmentAction,
  createInvoiceDraftAction,
  registerPurchaseSourceAction,
  type InvoiceActionState,
} from "@/modules/invoicing/actions";

const commands = {
  draft: createInvoiceDraftAction,
  approve: approveInvoiceBusinessAction,
  cancel: cancelInvoiceDraftAction,
  adjustment: createInvoiceAdjustmentAction,
  purchase: registerPurchaseSourceAction,
};

export function InvoiceCommand({
  kind,
  sourceId,
  invoiceId,
  adjustmentId,
  version,
}: {
  kind: keyof typeof commands;
  sourceId?: string;
  invoiceId?: string;
  adjustmentId?: string;
  version?: number;
}) {
  const [state, action, pending] = useActionState(commands[kind], { status: "idle", message: "" } as InvoiceActionState);
  const [operationId, setOperationId] = useState("");
  useEffect(() => setOperationId(crypto.randomUUID()), []);
  const labels = {
    draft: "Tạo nháp từ nguồn",
    approve: "Duyệt nguồn nghiệp vụ",
    cancel: "Hủy nháp",
    adjustment: "Lập nháp điều chỉnh",
    purchase: "Ghi sổ nguồn mua",
  };
  return <form action={action} className="form-stack">
    <input type="hidden" name="operation_id" value={operationId} />
    {sourceId && <input type="hidden" name="source_id" value={sourceId} />}
    {invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}
    {adjustmentId && <input type="hidden" name="adjustment_id" value={adjustmentId} />}
    {version && <input type="hidden" name="version" value={version} />}
    {(kind === "approve" || kind === "cancel") && <label className="field"><span>Lý do</span><input name="reason" minLength={3} maxLength={500} required placeholder="Ghi rõ căn cứ rà soát" /></label>}
    {kind === "purchase" && <div className="form-grid"><label className="field"><span>Số tham chiếu nhà cung cấp (nếu có)</span><input name="document_number" maxLength={100} /></label><label className="field"><span>Ngày trên chứng từ (nếu có)</span><input type="date" name="document_date" /></label></div>}
    <button className="button button-secondary" type="submit" disabled={pending || !operationId || state.status === "success"}>{pending ? "Đang xử lý..." : labels[kind]}</button>
    {state.message && <p role="status" className={state.status === "error" ? "error-message" : "muted"}>{state.message}{state.invoiceId && <Link className="code-link" href={`/admin/invoices/${state.invoiceId}`}> Xem nháp</Link>}</p>}
  </form>;
}
