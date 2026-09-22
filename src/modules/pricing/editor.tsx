"use client";

import { useActionState, useId, useState } from "react";
import { savePricingRuleAction } from "./actions";

export type PriceRule = { id: string; scope_type: string; customer_id: string | null; material_id: string | null; material_group_id: string | null; customer_tier_code: string | null; price_uom_id: string; unit_price_vnd: string; version: number; source_type: string; effective_from: string; effective_to: string | null; active: boolean };
export type PriceOptions = { customers: { id: string; name: string }[]; materials: { id: string; name: string }[]; groups: { id: string; name: string }[]; units: { id: string; name: string }[] };

export function PricingRuleEditor({ rule, options }: { rule?: PriceRule; options: PriceOptions }) {
  const [state, action, pending] = useActionState(savePricingRuleAction, undefined);
  const [scope, setScope] = useState("DEFAULT");
  const id = useId();
  const customerScope = scope === "CUSTOMER_MATERIAL" || scope === "CUSTOMER_GROUP";
  return <form action={action} className="card card-pad">
    {rule && <><input type="hidden" name="supersedesId" value={rule.id} /><input type="hidden" name="expectedVersion" value={rule.version} /></>}
    {!rule && <div className="field"><label htmlFor={`${id}-scope`}>Phạm vi *</label><select id={`${id}-scope`} name="scopeType" value={scope} onChange={(event) => setScope(event.target.value)}><option value="DEFAULT">Giá mặc định theo vật tư</option><option value="CUSTOMER_MATERIAL">Khách hàng + vật tư</option><option value="CUSTOMER_GROUP">Khách hàng + nhóm vật tư</option><option value="CUSTOMER_TIER">Nhóm giá khách + vật tư</option></select></div>}
    <div className="form-grid">
      {!rule && <>
        {customerScope && <div className="field"><label htmlFor={`${id}-customer`}>Khách hàng *</label><select id={`${id}-customer`} name="customerId" required><option value="">Chọn...</option>{options.customers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>}
        {scope === "CUSTOMER_TIER" && <div className="field"><label htmlFor={`${id}-tier`}>Nhóm giá khách *</label><input id={`${id}-tier`} name="tierCode" required maxLength={40} /></div>}
        {scope === "CUSTOMER_GROUP" ? <div className="field"><label htmlFor={`${id}-group`}>Nhóm vật tư *</label><select id={`${id}-group`} name="groupId" required><option value="">Chọn...</option>{options.groups.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div> : <div className="field"><label htmlFor={`${id}-material`}>Vật tư *</label><select id={`${id}-material`} name="materialId" required><option value="">Chọn...</option>{options.materials.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>}
        <div className="field"><label htmlFor={`${id}-uom`}>Đơn vị giá *</label><select id={`${id}-uom`} name="priceUomId" required><option value="">Chọn...</option>{options.units.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
      </>}
      <div className="field"><label htmlFor={`${id}-price`}>Đơn giá (VND) *</label><input id={`${id}-price`} name="unitPriceVnd" inputMode="numeric" pattern="[1-9][0-9]*" defaultValue={rule?.unit_price_vnd} required /></div>
      <div className="field"><label htmlFor={`${id}-source`}>Nguồn giá *</label><select id={`${id}-source`} name="sourceType" defaultValue={rule?.source_type ?? "LIST"}><option value="LIST">Bảng giá</option><option value="CONTRACT">Hợp đồng</option></select></div>
      <div className="field"><label htmlFor={`${id}-from`}>Hiệu lực từ ngày *</label><input id={`${id}-from`} name="effectiveFrom" type="date" required /></div>
      <div className="field"><label htmlFor={`${id}-to`}>Đến trước ngày</label><input id={`${id}-to`} name="effectiveTo" type="date" /></div>
      <div className="field field-full"><label htmlFor={`${id}-reason`}>Lý do thay đổi *</label><input id={`${id}-reason`} name="reason" required minLength={3} maxLength={500} /></div>
    </div>
    {rule && <p className="muted">Không sửa giá cũ: tạo phiên bản mới hoặc ngừng sử dụng. Chứng từ đã chốt giữ snapshot.</p>}
    {state && <p role="status" className="form-message">{state.message}</p>}
    <div className="form-actions"><button className="button button-primary" type="submit" name="mode" value={rule ? "replace" : "create"} disabled={pending || state?.success}>{pending ? "Đang lưu..." : rule ? "Tạo phiên bản mới" : "Tạo chính sách giá"}</button>{rule && <button className="button button-secondary" type="submit" name="mode" value="deactivate" formNoValidate disabled={pending || state?.success}>Ngừng sử dụng</button>}</div>
  </form>;
}
