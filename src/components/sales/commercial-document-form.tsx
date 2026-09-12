"use client";

import { useActionState, useMemo, useState } from "react";
import { createQuotationAction, createSalesOrderAction } from "@/modules/sales/actions";
import type { SalesFormOptions } from "@/modules/sales/form-options";

export function CommercialDocumentForm({ kind, options, operationId }: { kind: "order" | "quote"; options: SalesFormOptions; operationId: string }) {
  const action = kind === "order" ? createSalesOrderAction : createQuotationAction;
  const [state, formAction, pending] = useActionState(action, undefined);
  const [customerId, setCustomerId] = useState(options.customers[0]?.id ?? "");
  const [materialId, setMaterialId] = useState(options.materials[0]?.id ?? "");
  const sites = useMemo(() => options.customers.find((item) => item.id === customerId)?.sites ?? [], [customerId, options.customers]);
  const uoms = useMemo(() => options.materials.find((item) => item.id === materialId)?.uoms ?? [], [materialId, options.materials]);
  const empty = !options.customers.length || !options.materials.length || !sites.length || !uoms.length;
  return <form className="card card-pad" action={formAction}>
    <input type="hidden" name="operationId" value={operationId} />
    <div className="form-grid">
      <div className="field"><label htmlFor="customerId">Khách hàng</label><select id="customerId" name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>{options.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
      <div className="field"><label htmlFor="siteId">Công trình / điểm giao</label><select id="siteId" name="siteId" key={customerId} required>{sites.map((site) => <option key={site.id} value={site.id}>{site.name} · {site.address}</option>)}</select></div>
      <div className="field"><label htmlFor="materialId">Vật tư</label><select id="materialId" name="materialId" value={materialId} onChange={(event) => setMaterialId(event.target.value)} required>{options.materials.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}</select></div>
      <div className="field"><label htmlFor="orderedUomId">Đơn vị bán</label><select id="orderedUomId" name="orderedUomId" key={materialId} required>{uoms.map((uom) => <option key={uom.id} value={uom.id}>{uom.symbol}</option>)}</select></div>
      <div className="field"><label htmlFor="quantity">Số lượng</label><input id="quantity" name="quantity" inputMode="decimal" placeholder="1" required /></div>
      <div className="field"><label htmlFor="effectiveAt">{kind === "order" ? "Ngày giao dự kiến" : "Hiệu lực đến"}</label><input id="effectiveAt" name="effectiveAt" type="datetime-local" required={kind === "quote"} /></div>
      <div className="field field-full"><label htmlFor="terms">Điều khoản / ghi chú</label><textarea id="terms" name="terms" maxLength={1000} placeholder="Điều kiện giao, thanh toán hoặc lưu ý cho khách hàng" /></div>
    </div>
    <p className="muted form-hint">Đơn giá và quy đổi được resolve tại server từ policy đang hiệu lực, sau đó lưu snapshot vào chứng từ.</p>
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <div className="form-actions"><button className="button button-primary" type="submit" disabled={pending || empty}>{pending ? "Đang lưu..." : "Lưu bản nháp"}</button></div>
  </form>;
}
