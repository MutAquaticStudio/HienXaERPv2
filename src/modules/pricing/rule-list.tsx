"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { PricingRuleEditor, type PriceOptions, type PriceRule, type PurchasePriceRule } from "./editor";

/** One price version as the list shows it; labels are resolved on the server within the actor's read rights. */
export type PriceRuleRow = {
  id: string; party: string; target: string; uom: string; price: string; source: string; period: string; version: number;
  state: string; stateTone: "success" | "warning" | "info" | "danger"; editable: boolean; scopeLabel: string;
  rule?: PriceRule; purchaseRule?: PurchasePriceRule;
};

/**
 * KiotViet-style price list: one compact table, "Tạo …" and "Đổi giá" open the existing price editor in a popup.
 * Changing a price still creates a new version (or stops the old one) exactly as before.
 */
export function PricingRuleList({ rows, options, purchase = false, canManage, partyLabel, createLabel }: {
  rows: PriceRuleRow[]; options: PriceOptions; purchase?: boolean; canManage: boolean; partyLabel: string; createLabel: string;
}) {
  const [open, setOpen] = useState<{ row?: PriceRuleRow; command: { targetId: string; operationId: string } } | null>(null);
  const start = (row?: PriceRuleRow) => setOpen({ row, command: { targetId: crypto.randomUUID(), operationId: crypto.randomUUID() } });
  return <section className="card list-main">
    <div className="section-head"><h2>{rows.length} phiên bản giá</h2>
      {canManage && <button type="button" className="button button-primary" onClick={() => start()}>{createLabel}</button>}</div>
    {rows.length ? <div className="table-wrap"><table>
      <thead><tr><th scope="col">{partyLabel}</th><th scope="col">Vật tư / nhóm</th><th scope="col">ĐVT</th><th scope="col" className="numeric">{purchase ? "Giá mua" : "Giá bán"}</th>
        <th scope="col">Nguồn</th><th scope="col">Hiệu lực</th><th scope="col" className="numeric">Phiên bản</th><th scope="col">Trạng thái</th>
        {canManage && <th scope="col"><span className="sr-only">Thao tác</span></th>}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} data-price-rule-id={row.id}>
        <td data-label={partyLabel}>{row.party}</td>
        <td className="row-title" data-label="Vật tư / nhóm">{row.target}</td>
        <td data-label="ĐVT">{row.uom}</td>
        <td className="numeric mono" data-label={purchase ? "Giá mua" : "Giá bán"}><strong>{row.price}</strong></td>
        <td data-label="Nguồn">{row.source}</td>
        <td data-label="Hiệu lực">{row.period}</td>
        <td className="numeric" data-label="Phiên bản">{row.version}</td>
        <td data-label="Trạng thái"><StatusBadge tone={row.stateTone}>{row.state}</StatusBadge></td>
        {canManage && <td className="table-actions">{row.editable && <button type="button" className="button button-secondary button-compact" aria-label={`Đổi giá ${row.scopeLabel}`} onClick={() => start(row)}>Đổi giá</button>}</td>}
      </tr>)}</tbody>
    </table></div> : <p className="empty-inline">Chưa có giá phù hợp.</p>}
    {open && <Dialog size="lg" eyebrow={open.row ? "Đổi giá" : "Tạo mới"} title={open.row ? open.row.scopeLabel : createLabel.replace(/^\+\s*/, "")} onClose={() => setOpen(null)}
      description={open.row ? "Không sửa giá cũ: tạo phiên bản mới hoặc ngừng sử dụng. Chứng từ đã chốt giữ nguyên giá cũ." : undefined}>
      <PricingRuleEditor purchase={purchase} rule={open.row?.rule} purchaseRule={open.row?.purchaseRule} options={options} command={open.command} scopeLabel={open.row?.scopeLabel} />
    </Dialog>}
  </section>;
}
