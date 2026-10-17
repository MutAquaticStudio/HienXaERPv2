"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { saveInventoryThresholdAction } from "@/app/admin/inventory/actions";
import { NumberEntry } from "@/components/documents/editor/number-entry";
import { Dialog } from "@/components/ui/dialog";
import { decimalForEditing, normalizeDecimalInput } from "@/lib/core/vn-number";

export type ThresholdSetting = { warehouseId: string; threshold: string; active: boolean };

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending || disabled}>{pending ? "Đang lưu..." : "Lưu ngưỡng"}</button>;
}

/** "Ngưỡng": low-stock threshold of one material in one warehouse, edited in a popup (FB2 Đợt 5). */
export function ThresholdButton({ material, warehouses, settings, defaultWarehouseId, back, label = "Ngưỡng" }: {
  material: { id: string; name: string; symbol: string };
  warehouses: { id: string; name: string }[];
  settings: ThresholdSetting[];
  defaultWarehouseId?: string;
  /** The inventory view to return to after saving. */
  back: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? warehouses[0]?.id ?? "");
  const current = settings.find((row) => row.warehouseId === warehouseId);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const threshold = typed[warehouseId] ?? current?.threshold ?? "";
  const canonical = normalizeDecimalInput(threshold);
  const fieldId = `threshold-${material.id}`;
  return <>
    <button type="button" className="button button-secondary button-compact" onClick={() => setOpen(true)}>{label}</button>
    {open && <Dialog title={`Ngưỡng tồn · ${material.name}`} onClose={() => setOpen(false)} initialFocusId={fieldId}
      description="Khi tồn có thể bán của kho xuống dưới ngưỡng, vật tư hiện trong mục Dưới ngưỡng và ở Tổng quan. Hệ thống không tự đặt hàng.">
      <form action={saveInventoryThresholdAction} className="form-grid">
        <div className="field"><label htmlFor={`${fieldId}-warehouse`}>Kho</label>
          <select id={`${fieldId}-warehouse`} name="warehouseId" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>
            {warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        <div className="field"><label htmlFor={fieldId}>Ngưỡng có thể bán ({material.symbol})</label>
          <NumberEntry id={fieldId} inputMode="decimal" value={threshold} normalize={normalizeDecimalInput} display={decimalForEditing}
            onValue={(next) => setTyped((all) => ({ ...all, [warehouseId]: next }))} required />
          {threshold && !canonical && <small className="field-error" role="alert">Nhập số không âm, tối đa 6 chữ số thập phân.</small>}</div>
        <div className="field"><label htmlFor={`${fieldId}-active`}>Cảnh báo</label>
          <select id={`${fieldId}-active`} name="active" key={warehouseId} defaultValue={String(current?.active ?? true)}><option value="true">Bật</option><option value="false">Tắt</option></select></div>
        <input type="hidden" name="materialId" value={material.id} />
        <input type="hidden" name="threshold" value={canonical ?? ""} />
        <input type="hidden" name="back" value={back} />
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>Quay lại</button><Submit disabled={!canonical} /></div>
      </form>
    </Dialog>}
  </>;
}
