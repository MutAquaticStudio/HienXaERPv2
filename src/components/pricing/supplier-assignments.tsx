"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatVnd, vnd } from "@/lib/core/money";
import { setSupplierMaterialsAction, type PurchaseBookResult } from "@/modules/pricing/purchase-book-actions";

export type SupplierAssignmentRow = { supplierId: string; supplierName: string; uomId: string; currentVnd: string | null; since: string | null; cheapest: boolean };
type Draft = SupplierAssignmentRow & { isNew?: boolean };

/**
 * D61 "Nhà cung cấp" of a material: which suppliers sell it and in which purchase unit. A supplier assigned here shows
 * this material in its Bảng giá mua; unassigning only hides it there — its prices and purchase orders stay as they are.
 */
export function SupplierAssignments({ materialId, rows, suppliers, units, canManage }: {
  materialId: string; rows: SupplierAssignmentRow[]; suppliers: { id: string; name: string }[]; units: { id: string; symbol: string }[]; canManage: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft[]>(rows);
  const [removed, setRemoved] = useState<string[]>([]);
  const [adding, setAdding] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<PurchaseBookResult | null>(null);
  const [pending, startTransition] = useTransition();
  const unitName = (id: string) => units.find((unit) => unit.id === id)?.symbol ?? "Đơn vị";
  const original = new Map(rows.map((row) => [row.supplierId, row.uomId]));
  const changes = [
    ...draft.filter((row) => original.get(row.supplierId) !== row.uomId).map((row) => ({ supplierId: row.supplierId, materialId, uomId: row.uomId, active: true })),
    ...removed.map((supplierId) => ({ supplierId, materialId, active: false })),
  ];
  const free = suppliers.filter((supplier) => !draft.some((row) => row.supplierId === supplier.id));

  /** A new supplier starts in the unit the other suppliers sell this material in, not the base unit. */
  function usualUnit(current: Draft[]) {
    const count = (id: string) => current.filter((row) => row.uomId === id).length;
    return [...units].sort((left, right) => count(right.id) - count(left.id))[0].id;
  }
  function edited() { setResult(null); if (result && !result.outcomeUnknown) setOperationId(crypto.randomUUID()); }
  function add() {
    const supplier = suppliers.find((item) => item.id === adding);
    if (!supplier || !units.length) return;
    edited();
    setDraft((value) => [...value, { supplierId: supplier.id, supplierName: supplier.name, uomId: usualUnit(value), currentVnd: null, since: null, cheapest: false, isNew: true }]);
    setRemoved((value) => value.filter((id) => id !== supplier.id));
    setAdding("");
  }
  function remove(row: Draft) {
    edited();
    setDraft((value) => value.filter((item) => item.supplierId !== row.supplierId));
    if (original.has(row.supplierId)) setRemoved((value) => [...value, row.supplierId]);
  }
  function save() {
    if (!changes.length || pending) return;
    startTransition(async () => {
      const saved = await setSupplierMaterialsAction({ operationId, items: changes })
        .catch(() => ({ success: false, outcomeUnknown: true, message: "Chưa xác định kết quả. Bấm lưu lại; hệ thống không ghi trùng." }));
      setResult(saved);
      if (saved.success) { setRemoved([]); setOperationId(crypto.randomUUID()); router.refresh(); }
    });
  }

  return <div className="supplier-assignments form-stack">
    {draft.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">Nhà cung cấp</th><th scope="col">Đơn vị mua</th><th scope="col" className="numeric">Giá mua hiện tại</th><th scope="col">Từ ngày</th>{canManage && <th scope="col"><span className="sr-only">Thao tác</span></th>}</tr></thead>
      <tbody>{draft.map((row) => <tr key={row.supplierId} className={row.isNew ? "supplier-assignment-new" : undefined}>
        <td><strong>{row.supplierName}</strong>{row.cheapest && <span className="purchase-book-cheapest">Rẻ nhất</span>}{row.isNew && <small className="table-subline">Vừa chọn — bấm Lưu</small>}</td>
        <td>{canManage ? <select aria-label={`Đơn vị mua của ${row.supplierName}`} value={row.uomId} onChange={(event) => { edited(); setDraft((value) => value.map((item) => item.supplierId === row.supplierId ? { ...item, uomId: event.target.value } : item)); }}>
          {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.symbol}</option>)}</select> : unitName(row.uomId)}</td>
        <td className="numeric mono">{row.currentVnd ? formatVnd(vnd(row.currentVnd)) : <span className="purchase-book-missing">Chưa có giá</span>}</td>
        <td>{row.since ?? "—"}</td>
        {canManage && <td className="table-actions"><div className="row-actions">
          {!row.isNew && <Link className="code-link" href={`/admin/suppliers/pricing?supplier=${row.supplierId}`}>Sửa giá</Link>}
          <button type="button" className="link-button text-danger" aria-label={`Bỏ gán ${row.supplierName}`} onClick={() => remove(row)}>Bỏ gán</button></div></td>}
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa gán nhà cung cấp nào. {canManage ? "Chọn nhà cung cấp bán vật tư này bên dưới." : ""}</p>}
    {canManage && <>
      <div className="supplier-assignments-add">
        <label className="field"><span>Gán nhà cung cấp</span><select value={adding} onChange={(event) => setAdding(event.target.value)}>
          <option value="">Chọn nhà cung cấp</option>{free.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
        <button type="button" className="button button-secondary" disabled={!adding} onClick={add}>+ Gán nhà cung cấp</button>
      </div>
      {result && <p className={`form-message${result.success ? " success" : ""}`} role={result.success ? "status" : "alert"}>{result.message}</p>}
      <div className="form-actions">{changes.length > 0 && <span className="settings-dirty" role="status">Có thay đổi chưa lưu</span>}
        <button type="button" className="button button-primary" disabled={!changes.length || pending} onClick={save}>{pending ? "Đang lưu…" : result?.outcomeUnknown ? "Lưu lại đúng thao tác" : "Lưu nhà cung cấp"}</button></div>
      <p className="muted">Bỏ gán chỉ ẩn vật tư khỏi bảng giá của nhà cung cấp đó; giá cũ và đơn mua cũ giữ nguyên. Hệ thống tự phân nguồn chọn nhà cung cấp rẻ nhất còn giá.</p>
    </>}
  </div>;
}
