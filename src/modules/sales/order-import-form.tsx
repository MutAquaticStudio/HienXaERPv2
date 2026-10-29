"use client";

// FB15 (D37): "Nhập đơn bán từ Excel" — upload, check every order (customer, site, goods, units, prices), then create the
// ready ones as drafts and open them from the result list.
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";

import { formatVnd, vnd } from "@/lib/core/money";
import { createImportedOrdersAction, previewOrderImportAction, type ImportPreview, type ImportResult } from "./order-import-actions";

export function OrderImportForm() {
  const [preview, check, checking] = useActionState<ImportPreview | undefined, FormData>(previewOrderImportAction, undefined);
  const [results, setResults] = useState<{ fileId: string; list: ImportResult[] } | null>(null);
  const [creating, start] = useTransition();
  const ready = preview?.orders.filter((order) => order.input) ?? [];
  const shownResults = results && results.fileId === preview?.fileId ? results.list : null;

  function create() {
    if (!preview?.fileId || !ready.length || creating) return;
    const fileId = preview.fileId;
    start(async () => { setResults({ fileId, list: await createImportedOrdersAction({ fileId, orders: ready.map((order) => order.input) }) }); });
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
      <form action={check} className="import-upload" onSubmit={() => setResults(null)}>
        <label className="field"><span>File Excel đã điền</span>
          <input type="file" name="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
        <button className="button button-primary" type="submit" disabled={checking}>{checking ? "Đang kiểm tra…" : "Kiểm tra file"}</button>
      </form>
      {preview && <p role="status" className={preview.ok ? "form-message success" : "form-message"}>{preview.message}</p>}
      {preview?.problems.slice(preview.ok ? 0 : 1).map((problem) => <p key={problem} className="form-message">{problem}</p>)}
    </section>

    {preview?.ok && <section className="card">
      <div className="section-head"><h2>{preview.orders.length} đơn trong file</h2>
        {!shownResults && <button type="button" className="button button-commerce" onClick={create} disabled={!ready.length || creating}>
          {creating ? "Đang tạo…" : `Tạo ${ready.length} đơn nháp`}</button>}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Nhóm đơn</th><th>Khách hàng / công trình</th><th>Ngày giao</th><th>Hàng</th><th className="numeric">Tổng tiền</th><th>Kết quả</th></tr></thead>
        <tbody>{preview.orders.map((order) => {
          const result = shownResults?.find((item) => item.key === order.key);
          return <tr key={order.key} className={order.problems.length ? "row-muted" : undefined}>
            <td><strong>{order.key}</strong><small className="table-subline">{order.rows}</small></td>
            <td>{order.customerName}<small className="table-subline">{order.siteName}</small></td>
            <td>{order.deliveryDate ?? "Giao ngay"}</td>
            <td><details><summary>{order.lines.length} dòng hàng</summary><ul className="clean-list import-lines">{order.lines.map((line, index) =>
              <li key={index}>{line.materialName} · {line.quantity} {line.unit}{order.input ? ` × ${formatVnd(vnd(line.unitPriceVnd))}${line.manualPrice ? " (giá riêng)" : ""}` : ""}</li>)}</ul></details></td>
            <td className="numeric mono">{order.input ? formatVnd(vnd(order.totalVnd)) : "—"}</td>
            <td>{result ? (result.orderId ? <Link className="code-link" href={`/admin/orders/${result.orderId}`}>{result.orderNumber ?? "Mở đơn"}</Link>
                : <span className="form-message">{result.error}</span>)
              : order.problems.length ? <ul className="import-problems">{order.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
              : <span className="status-badge success">Sẵn sàng</span>}</td>
          </tr>;
        })}</tbody>
      </table></div>
      {shownResults && <p className="form-message success" role="status">Đã tạo {shownResults.filter((item) => item.orderId).length} đơn nháp. Mở từng đơn để kiểm tra và xác nhận.</p>}
    </section>}
  </div>;
}
