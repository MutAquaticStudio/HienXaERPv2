"use client";

// FB15 (D37): "Nhập đơn bán từ Excel" — upload, check every order (customer, site, goods, units, prices), fix on the
// preview what the file names wrongly (pick the right customer / site / goods / unit, or add the customer), then create
// the ready ones — as drafts, or confirmed and sourced like the order screen.
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { EntityCombobox } from "@/components/documents/editor/entity-combobox";
import type { EntityOption } from "@/components/documents/editor/types";
import { QuickCreatePanel } from "@/components/sales/commercial-document-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatVnd, vnd } from "@/lib/core/money";
import { searchSalesSitesAction } from "./form-lookup-actions";
import { createImportedOrdersAction, previewOrderImportAction, reviewOrderImportAction, searchImportCustomersAction, searchImportMaterialsAction,
  type ImportPreview, type ImportResult } from "./order-import-actions";
import type { ImportFix, ImportOverrides } from "./order-import-data";

type Overrides = ImportOverrides;
const EMPTY: Overrides = { customers: {}, sites: {}, materials: {}, units: {}, sellers: {} };
const FIELD: Record<ImportFix["kind"], keyof Overrides> = { customer: "customers", site: "sites", material: "materials", unit: "units", seller: "sellers" };
const looksLikePhone = (text: string) => /^\+?[\d\s.()-]{9,}$/.test(text.trim());
type Quick = { mode: "customer"; fix: Extract<ImportFix, { kind: "customer" }> } | { mode: "site"; fix: Extract<ImportFix, { kind: "site" }> };

export function OrderImportForm({ canConfirm = false, canManageCustomers = false }: { canConfirm?: boolean; canManageCustomers?: boolean }) {
  const [uploaded, check, checking] = useActionState<ImportPreview | undefined, FormData>(previewOrderImportAction, undefined);
  // What the person fixed on this upload; a new upload starts again from the file.
  const [fixed, setFixed] = useState<{ base: ImportPreview; overrides: Overrides; preview: ImportPreview } | null>(null);
  const [results, setResults] = useState<{ fileId: string; list: ImportResult[] } | null>(null);
  const [quick, setQuick] = useState<Quick | null>(null);
  const [creating, start] = useTransition();
  const [reviewing, startReview] = useTransition();
  const [confirmNow, setConfirmNow] = useState(false);
  const current = fixed && fixed.base === uploaded ? fixed : null;
  const preview = current?.preview ?? uploaded;
  const overrides = current?.overrides ?? EMPTY;
  const shownResults = results && results.fileId === preview?.fileId ? results.list : null;
  const createdKeys = new Set((shownResults ?? []).filter((item) => item.orderId).map((item) => item.key));
  const ready = preview?.orders.filter((order) => order.input && !createdKeys.has(order.key)) ?? [];

  function create() {
    if (!preview?.fileId || !ready.length || creating) return;
    const fileId = preview.fileId;
    start(async () => {
      const list = await createImportedOrdersAction({ fileId, confirm: canConfirm && confirmNow, orders: ready.map((order) => order.input) });
      setResults((earlier) => ({ fileId, list: [...(earlier?.fileId === fileId ? earlier.list.filter((item) => !list.some((next) => next.key === item.key)) : []), ...list] }));
    });
  }

  /** Re-checks the file with one more choice; `then` runs on the new preview (to ask for the new customer's site). */
  function choose(fix: ImportFix, id: string, then?: (next: ImportPreview) => void) {
    if (!uploaded?.fileId || !uploaded.groups) return;
    const next: Overrides = { ...overrides, [FIELD[fix.kind]]: { ...(overrides[FIELD[fix.kind]] ?? {}), [fix.key]: id } };
    const base = uploaded;
    startReview(async () => {
      const reviewed = await reviewOrderImportAction({ fileId: base.fileId, groups: base.groups, problems: base.problems, overrides: next });
      if (!reviewed.ok) return;
      setFixed({ base, overrides: next, preview: reviewed });
      then?.(reviewed);
    });
  }

  function fixBox(fix: ImportFix) {
    const pick = (option: EntityOption | null) => { if (option) choose(fix, option.id); };
    const title = fix.kind === "customer" ? `Chọn khách cho "${fix.text}"` : fix.kind === "site" ? (fix.text ? `Chọn công trình cho "${fix.text}"` : "Chọn công trình")
      : fix.kind === "material" ? `Dòng ${fix.row}: chọn hàng cho "${fix.text}"` : fix.kind === "unit" ? `Dòng ${fix.row}: chọn đơn vị thay "${fix.text}"`
      : `Chọn NV bán cho "${fix.text}"`;
    const search = fix.kind === "customer" ? searchImportCustomersAction : fix.kind === "material" ? searchImportMaterialsAction
      : fix.kind === "site" ? async (term: string) => (await searchSalesSitesAction("order", fix.customerId, term)).map((site) => ({ id: site.id, label: site.name, detail: site.address ?? undefined }))
      : undefined;
    const action = canManageCustomers && fix.kind === "customer" ? <button type="button" className="quick-create-trigger" onClick={() => setQuick({ mode: "customer", fix })}>+ Tạo khách mới</button>
      : canManageCustomers && fix.kind === "site" ? <button type="button" className="quick-create-trigger" onClick={() => setQuick({ mode: "site", fix })}>+ Thêm công trình</button> : undefined;
    return <div key={`${fix.kind}:${fix.key}:${"row" in fix ? fix.row : ""}`} className="import-fix">
      <EntityCombobox label={title} name={`fix-${fix.kind}`} value={null} options={fix.options} onSearch={search} onSelect={pick} disabled={reviewing || creating}
        placeholder={fix.kind === "unit" ? "Chọn đơn vị" : "Gõ mã, tên để tìm"} action={action} emptyText="Không có kết quả. Gõ để tìm thêm." />
    </div>;
  }

  return <div className="page-stack">
    <section className="card card-pad">
      <ol className="import-steps">
        <li><strong>Tải file mẫu</strong><span>File có sẵn danh sách khách hàng và hàng hóa của chi nhánh để chép mã.</span></li>
        <li><strong>Điền đơn</strong><span>Mỗi dòng là một dòng hàng; các dòng cùng “Nhóm đơn” thành một đơn.</span></li>
        <li><strong>Tải lên và kiểm tra</strong><span>Hệ thống tính giá theo bảng giá, báo lỗi từng đơn, rồi tạo các đơn nháp.</span></li>
      </ol>
      <div className="action-cluster">
        <a className="button button-secondary" href="/api/orders/import-template" download>Tải file mẫu (.xlsx)</a>
      </div>
      <form action={check} className="import-upload" onSubmit={() => { setResults(null); setFixed(null); }}>
        <label className="field"><span>File Excel đã điền</span>
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
        <button className="button button-primary" type="submit" disabled={checking}>{checking ? "Đang kiểm tra…" : "Kiểm tra file"}</button>
      </form>
      {preview && <p role="status" className={preview.ok ? "form-message success" : "form-message"}>{preview.message}</p>}
      {preview?.problems.slice(preview.ok ? 0 : 1).map((problem) => <p key={problem} className="form-message">{problem}</p>)}
    </section>

    {preview?.ok && <section className="card">
      <div className="section-head"><h2>{preview.orders.length} đơn trong file</h2>
        {ready.length > 0 && <div className="action-cluster">
          {canConfirm && <label className="check-inline import-confirm"><input type="checkbox" checked={confirmNow} onChange={(event) => setConfirmNow(event.target.checked)} />
            <span>Xác nhận luôn<small>Lấy hàng trong kho trước, thiếu thì tự tạo đơn mua — như bấm Xác nhận</small></span></label>}
          <button type="button" className="button button-commerce" onClick={create} disabled={!ready.length || creating}>
            {creating ? "Đang tạo…" : confirmNow && canConfirm ? `Tạo và xác nhận ${ready.length} đơn` : `Tạo ${ready.length} đơn nháp`}</button>
        </div>}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Nhóm đơn</th><th>Khách hàng / công trình</th><th>Ngày giao</th><th>Hàng</th><th className="numeric">Tổng tiền</th><th>Kết quả</th></tr></thead>
        <tbody>{preview.orders.map((order) => {
          const result = shownResults?.find((item) => item.key === order.key);
          return <tr key={order.key} className={order.problems.length ? "row-muted" : undefined}>
            <td><strong>{order.key}</strong><small className="table-subline">{order.rows}</small></td>
            <td>{order.customerName}<small className="table-subline">{order.siteName}</small>
              {order.notes.length > 0 && <ul className="import-notes" aria-label="Nhận theo tên">{order.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
              {!result?.orderId && order.fixes.filter((fix) => fix.kind === "customer" || fix.kind === "site" || fix.kind === "seller").map(fixBox)}</td>
            <td>{order.deliveryDate ?? "Giao ngay"}</td>
            <td><details><summary>{order.lines.length} dòng hàng</summary><ul className="clean-list import-lines">{order.lines.map((line, index) =>
              <li key={index}>{line.materialName} · {line.quantity} {line.unit}{order.input ? ` × ${formatVnd(vnd(line.unitPriceVnd))}${line.manualPrice ? " (giá riêng)" : ""}` : ""}</li>)}</ul></details>
              {!result?.orderId && order.fixes.filter((fix) => fix.kind === "material" || fix.kind === "unit").map(fixBox)}</td>
            <td className="numeric mono">{order.input ? formatVnd(vnd(order.totalVnd)) : "—"}</td>
            <td className="import-result">{result ? (result.orderId ? <><Link className="code-link" href={`/admin/orders/${result.orderId}`}>{result.orderNumber ?? "Mở đơn"}</Link>
                {result.confirmation && <small className={`table-subline ${result.confirmed ? "import-ok" : "import-warn"}`}>{result.confirmation}</small>}</>
                : <span className="form-message">{result.error}</span>)
              : order.problems.length ? <ul className="import-problems">{order.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
              : <StatusBadge tone="success">Sẵn sàng</StatusBadge>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {reviewing && <p className="muted import-reviewing" role="status">Đang kiểm tra lại…</p>}
      {shownResults && <p className="form-message success" role="status">{resultMessage(shownResults)}</p>}
    </section>}
    {quick?.mode === "customer" && <QuickCreatePanel mode="customer" customerId="" onClose={() => setQuick(null)} onSiteCreated={() => undefined}
      defaults={looksLikePhone(quick.fix.text) ? { phone: quick.fix.text } : { name: quick.fix.text }}
      onCustomerCreated={(customer) => {
        const fix = quick.fix;
        setQuick(null);
        // A new customer has no site yet, and an order needs one: ask for it right away, like the order screen.
        choose(fix, customer.id, (next) => {
          const site = next.orders.flatMap((order) => order.fixes).find((item): item is Extract<ImportFix, { kind: "site" }> => item.kind === "site" && item.customerId === customer.id);
          if (site) setQuick({ mode: "site", fix: site });
        });
      }} />}
    {quick?.mode === "site" && <QuickCreatePanel mode="site" customerId={quick.fix.customerId} onClose={() => setQuick(null)} onCustomerCreated={() => undefined}
      defaults={{ name: quick.fix.text || undefined }}
      onSiteCreated={(site) => { const fix = quick.fix; setQuick(null); choose(fix, site.id); }} />}
  </div>;
}

function resultMessage(list: ImportResult[]) {
  const created = list.filter((item) => item.orderId).length;
  const confirmed = list.filter((item) => item.confirmed).length;
  if (!list.some((item) => item.confirmation)) return `Đã tạo ${created} đơn nháp. Mở từng đơn để kiểm tra và xác nhận.`;
  return `Đã tạo ${created} đơn, xác nhận ${confirmed} đơn (đã giữ hàng trong kho / tạo đơn mua phần thiếu). Lập phiếu giao trong từng đơn hoặc ở Điều phối.`;
}
