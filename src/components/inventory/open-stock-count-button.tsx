"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Dialog } from "@/components/ui/dialog";
import { openStockCountAction } from "@/modules/inventory/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Đang tạo..." : "Tạo phiếu và bắt đầu đếm"}</button>;
}

/** "Tạo phiếu kiểm": choose the warehouse; the book is cut off when the popup opens. */
export function OpenStockCountButton({ warehouses, defaultWarehouseId }: { warehouses: { id: string; name: string }[]; defaultWarehouseId?: string }) {
  // Fixed when the popup opens, so a retried submit sends the very same command.
  const [form, setForm] = useState<{ operationId: string; cutoffAt: string } | null>(null);
  return <>
    <button type="button" className="button button-primary" onClick={() => setForm({ operationId: crypto.randomUUID(), cutoffAt: new Date().toISOString() })}>+ Tạo phiếu kiểm</button>
    {form && <Dialog title="Tạo phiếu kiểm kho" onClose={() => setForm(null)} initialFocusId="open-count-warehouse"
      description="Phiếu lấy tồn sổ sách của kho tại lúc mở cửa sổ này; mọi vật tư đang có tồn được điền sẵn để nhập số thực tế.">
      <form action={openStockCountAction} className="form-grid">
        <div className="field"><label htmlFor="open-count-warehouse">Kho kiểm *</label>
          <select id="open-count-warehouse" name="warehouseId" required defaultValue={defaultWarehouseId ?? (warehouses.length === 1 ? warehouses[0].id : "")}>
            <option value="" disabled>Chọn kho</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        <input type="hidden" name="cutoffAt" value={form.cutoffAt} />
        <input type="hidden" name="operationId" value={form.operationId} />
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setForm(null)}>Quay lại</button><Submit /></div>
      </form>
    </Dialog>}
  </>;
}
