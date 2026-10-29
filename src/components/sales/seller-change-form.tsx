"use client";

// FB16 (D38): the owner's "Đổi" beside the order's seller.
import { useActionState, useState } from "react";

import { setSalesOrderSellerAction, type SellerChangeState } from "@/modules/sales/seller-actions";

export function SellerChangeForm({ orderId, currentId, sellers, operationId }: { orderId: string; currentId: string | null; sellers: { id: string; name: string }[]; operationId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SellerChangeState, FormData>(setSalesOrderSellerAction, undefined);
  if (!open) return <>{state?.message && <small className={`table-subline ${state.success ? "import-ok" : "text-danger"}`} role="status">{state.message}</small>}
    <button type="button" className="quick-create-trigger" onClick={() => setOpen(true)}>Đổi</button></>;
  return <form action={action} className="seller-change" onSubmit={() => setOpen(false)}>
    <input type="hidden" name="orderId" value={orderId} />
    <input type="hidden" name="operationId" value={operationId} />
    <label className="sr-only" htmlFor={`seller-${orderId}`}>Nhân viên bán hàng</label>
    <select id={`seller-${orderId}`} name="sellerEmployeeId" defaultValue={currentId ?? ""} required>
      <option value="" disabled>Chọn nhân viên</option>
      {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
    </select>
    <button className="button button-primary button-compact" disabled={pending}>Lưu</button>
    <button type="button" className="button button-secondary button-compact" onClick={() => setOpen(false)}>Hủy</button>
  </form>;
}
