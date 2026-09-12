"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupplierQuickAction } from "@/modules/purchasing/actions";

export function QuickSupplierForm({ operationId }: { operationId: string }) {
  const [state, action, pending] = useActionState(createSupplierQuickAction, undefined);
  const router = useRouter();
  useEffect(() => { if (state?.success) router.refresh(); }, [router, state?.success]);
  return <details className="card card-pad quick-create"><summary>Thêm nhanh nhà cung cấp</summary><form action={action}><input type="hidden" name="operationId" value={operationId} /><div className="form-grid compact-grid"><div className="field"><label htmlFor="supplierCode">Mã NCC</label><input id="supplierCode" name="code" pattern="[A-Za-z0-9_-]{2,32}" required /></div><div className="field"><label htmlFor="supplierName">Tên NCC</label><input id="supplierName" name="name" required /></div><div className="field"><label htmlFor="supplierPhone">Điện thoại</label><input id="supplierPhone" name="phone" /></div></div>{state?.message && <p className={`form-message${state.success ? " success" : ""}`}>{state.message}</p>}<div className="form-actions"><button className="button button-secondary" disabled={pending} type="submit">{pending ? "Đang thêm..." : "Thêm NCC"}</button></div></form></details>;
}
