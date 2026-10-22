"use client";

import { ReliableCommandForm } from "@/components/reliable-command-form";
import { invoiceCommandWithOutcomeAction } from "@/modules/invoicing/document-actions";
import type { DocumentCommand } from "@/modules/invoicing/document-commands";
const commands: Record<string, DocumentCommand> = { draft: "create_invoice_draft", approve: "approve_invoice_business", cancel: "cancel_invoice_draft", adjustment: "create_invoice_adjustment_draft", purchase: "register_purchase_invoice_source" };
export function InvoiceCommand({ kind, sourceId, invoiceId, adjustmentId, version, operationId, scope }: { kind: "draft" | "approve" | "cancel" | "adjustment" | "purchase"; sourceId?: string; invoiceId?: string; adjustmentId?: string; version?: number; operationId: string; scope: string }) {
 const labels = { draft: "Tạo nháp từ nguồn", approve: "Duyệt nguồn nghiệp vụ", cancel: "Hủy nháp", adjustment: "Lập nháp điều chỉnh", purchase: "Ghi sổ nguồn mua" };
 return <ReliableCommandForm action={invoiceCommandWithOutcomeAction} command={commands[kind]} scope={scope} operationId={operationId} className="form-stack">
  <input type="hidden" name="kind" value={kind} />{sourceId && <input type="hidden" name="source_id" value={sourceId} />}{invoiceId && <input type="hidden" name="invoice_id" value={invoiceId} />}{adjustmentId && <input type="hidden" name="adjustment_id" value={adjustmentId} />}{version && <input type="hidden" name="version" value={version} />}
  {(kind === "approve" || kind === "cancel") && <label className="field"><span>{kind === "approve" ? "Ghi chú duyệt (không bắt buộc)" : "Ghi chú hủy (không bắt buộc)"}</span><input name="reason" maxLength={500} /></label>}
  {kind === "purchase" && <div className="form-grid"><label className="field"><span>Số tham chiếu nhà cung cấp (nếu có)</span><input name="document_number" maxLength={100} /></label><label className="field"><span>Ngày trên chứng từ (nếu có)</span><input type="date" name="document_date" /></label></div>}
  <button className="button button-secondary" type="submit">{labels[kind]}</button>
 </ReliableCommandForm>;
}
