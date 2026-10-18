"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import { CatalogDialog } from "@/modules/catalog/catalog-dialog";

export type ServiceTypeOption = { id: string; code: string; name: string; unit_label: string; default_price_vnd: string | null; resource_kind: "NONE" | "VEHICLE" | "MACHINE" };

const priceText = (type: ServiceTypeOption) => type.default_price_vnd ? `${formatVnd(vnd(type.default_price_vnd))}/${type.unit_label}` : "đơn giá nhập khi xác minh";

/**
 * D23: the service is picked from the owner's catalogue ("+ Thêm loại" adds one in a popup and selects it). The type
 * sets the unit of the planned quantity and shows only the vehicle or the machine field it needs.
 */
export function ServiceTypeFields({ types, vehicleField, machineField, scope }: {
  types: ServiceTypeOption[]; vehicleField: ReactNode; machineField: ReactNode; scope: string;
}) {
  const router = useRouter();
  const [typeId, setTypeId] = useState(types.length === 1 ? types[0].id : "");
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = types.find((type) => type.id === typeId);
  const resource = selected?.resource_kind ?? "NONE";
  return <>
    <div className="field">
      <label htmlFor="service-type">Loại dịch vụ</label>
      <div className="field-label-row">
        <select id="service-type" name="serviceTypeId" required value={typeId} onChange={(event) => setTypeId(event.target.value)}>
          <option value="">{types.length ? "Chọn loại dịch vụ" : "Chưa có loại dịch vụ"}</option>
          {types.map((type) => <option key={type.id} value={type.id}>{type.name} · {priceText(type)}</option>)}
        </select>
        <button type="button" className="button button-secondary" onClick={() => { setNotice(""); setAdding(true); }}>+ Thêm loại</button>
      </div>
      {selected ? <small className="muted">Tính theo {selected.unit_label} · {priceText(selected)}</small>
        : !types.length && <small className="muted">Bấm “+ Thêm loại” để tạo, ví dụ “Xe chở hàng” theo chuyến hoặc “Máy xúc” theo giờ.</small>}
      {notice && <small className="form-message success" role="status">{notice}</small>}
    </div>
    <div className="field">
      <label htmlFor="service-quantity">Sản lượng kế hoạch{selected ? ` (${selected.unit_label})` : ""}</label>
      <input id="service-quantity" name="plannedQuantity" inputMode="decimal" required />
    </div>
    {/* Only the resource the type needs is shown, so nothing else can be attached. */}
    {resource === "VEHICLE" && vehicleField}
    {resource === "MACHINE" && machineField}
    {adding && <CatalogDialog kind="service_types" options={{}} permissions={[]} scope={scope} onClose={() => setAdding(false)}
      onSaved={(saved) => { setTypeId(saved.id); setNotice(saved.message); setAdding(false); router.refresh(); }} />}
  </>;
}
