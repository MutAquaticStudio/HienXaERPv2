"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";

export type MaterialListRow = {
  id: string; code: string; name: string; specification: string | null; group: string; uom: string;
  saleEnabled: boolean; purchaseEnabled: boolean; active: boolean;
  price?: { unitPriceVnd: string; uom: string } | null;
  averageCostVnd?: string | null;
  stock?: { onHand: string; available: string; warehouses: { name: string; onHand: string; available: string }[] } | null;
  conversions: string[];
};

/** Rows open the material; the arrow expands stock per warehouse and unit conversions in place. */
export function MaterialListRows({ rows, showPrice, showCost, showStock }: { rows: MaterialListRow[]; showPrice: boolean; showCost: boolean; showStock: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const columns = 6 + Number(showPrice) + Number(showCost) + Number(showStock);
  return <tbody>{rows.map((row) => {
    const expanded = open === row.id;
    const href = `/admin/products/${row.id}`;
    return <Fragment key={row.id}>
      <tr className={row.active ? undefined : "row-muted"}>
        <td className="row-toggle"><button type="button" className="icon-button" aria-expanded={expanded} aria-controls={`material-${row.id}`} aria-label={`${expanded ? "Thu gọn" : "Mở rộng"} ${row.name}`} onClick={() => setOpen(expanded ? null : row.id)}>{expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}</button></td>
        <td className="mono" data-label="Mã"><Link className="code-link" href={href} tabIndex={-1}>{row.code}</Link></td>
        <td className="row-title" data-label="Tên vật tư"><Link className="code-link row-link" href={href}>{row.name}</Link>{row.specification && <small className="table-subline">{row.specification}</small>}</td>
        <td data-label="Nhóm">{row.group}</td>
        <td data-label="ĐVT">{row.uom}</td>
        {showPrice && <td className="numeric mono" data-label="Giá bán">{row.price ? <>{formatVnd(vnd(row.price.unitPriceVnd))}{row.price.uom !== row.uom && <small className="table-subline">/{row.price.uom}</small>}</> : <span className="muted">Chưa có</span>}</td>}
        {showCost && <td className="numeric mono" data-label="Giá vốn">{row.averageCostVnd ? formatVnd(vnd(row.averageCostVnd)) : "—"}</td>}
        {showStock && <td className="numeric mono" data-label="Tồn kho">{row.stock ? formatQuantity(row.stock.onHand) : "0"}{row.stock && row.stock.available !== row.stock.onHand && <small className="table-subline">Khả dụng {formatQuantity(row.stock.available)}</small>}</td>}
        <td data-label="Trạng thái"><StatusBadge tone={row.active ? "success" : "danger"}>{row.active ? "Đang dùng" : "Ngừng dùng"}</StatusBadge><small className="table-subline">{[row.saleEnabled && "Bán", row.purchaseEnabled && "Mua"].filter(Boolean).join(" · ") || "Không bán/mua"}</small></td>
      </tr>
      {expanded && <tr id={`material-${row.id}`} className="row-expansion"><td colSpan={columns}>
        <div className="row-expansion-grid">
          {showStock && <section><h3>Tồn theo kho</h3>{row.stock?.warehouses.length ? <ul className="clean-list">{row.stock.warehouses.map((item) => <li key={item.name}><strong>{item.name}</strong><small>Trong kho {formatQuantity(item.onHand)} {row.uom} · khả dụng {formatQuantity(item.available)}</small></li>)}</ul> : <p className="muted">Chưa có tồn kho.</p>}</section>}
          <section><h3>Quy đổi đơn vị</h3>{row.conversions.length ? <ul className="clean-list">{row.conversions.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">Chỉ dùng đơn vị gốc {row.uom}.</p>}</section>
          <section><Link className="button button-secondary" href={href}>Xem chi tiết vật tư</Link></section>
        </div>
      </td></tr>}
    </Fragment>;
  })}</tbody>;
}
