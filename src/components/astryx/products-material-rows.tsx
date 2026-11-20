"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AxStatus } from "./ax-kit";
import { BulkRowCheckbox } from "@/components/lists/bulk-selection";
import type { MaterialListRow } from "@/components/catalog/material-list-rows";
import { formatVnd, vnd } from "@/lib/core/money";
import { formatQuantity } from "@/lib/core/quantity";
import "./buystock.css";

/** Các hàng vật tư kiểu Astryx (cùng dữ liệu với MaterialListRows): mũi tên mở tồn theo kho và quy đổi đơn vị ngay dưới dòng. */
export function AxMaterialRows({ rows, showPrice, showCost, showStock, selectable = false }: { rows: MaterialListRow[]; showPrice: boolean; showCost: boolean; showStock: boolean; selectable?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const columns = 6 + Number(showPrice) + Number(showCost) + Number(showStock) + Number(selectable);
  return <tbody>{rows.map((row) => {
    const expanded = open === row.id;
    const href = `/admin/products/${row.id}`;
    return <Fragment key={row.id}>
      <tr className={row.active ? undefined : "bs-muted"}>
        {selectable && <td><BulkRowCheckbox id={row.id} label={`${row.code} ${row.name}`} /></td>}
        <td><button type="button" className="hx-exp" aria-expanded={expanded} aria-controls={`material-${row.id}`} aria-label={`${expanded ? "Thu gọn" : "Mở rộng"} ${row.name}`} onClick={() => setOpen(expanded ? null : row.id)}>
          {expanded ? <ChevronDown className="hx-ico" aria-hidden /> : <ChevronRight className="hx-ico" aria-hidden />}</button></td>
        <td><Link className="hx-code" href={href}>{row.code}</Link></td>
        <td><Link href={href}><b>{row.name}</b></Link>{row.specification && <small className="bs-sub">{row.specification}</small>}
          {row.variant && <small className="bs-sub">{row.variant.label} · <Link className="hx-code" href={`/admin/products?variant=${row.variant.groupId}`}>Cùng loại {row.variant.group}</Link></small>}</td>
        <td>{row.group}</td>
        <td>{row.uom}</td>
        {showPrice && <td className="hx-num">{row.price ? <>{formatVnd(vnd(row.price.unitPriceVnd))}{row.price.uom !== row.uom && <small className="bs-sub">/{row.price.uom}</small>}</> : <span className="hx-muted">Chưa có</span>}</td>}
        {showCost && <td className="hx-num">{row.averageCostVnd ? formatVnd(vnd(row.averageCostVnd)) : "—"}</td>}
        {showStock && <td className="hx-num"><b>{row.stock ? formatQuantity(row.stock.onHand) : "0"}</b> {row.uom}{row.stock && row.stock.available !== row.stock.onHand && <small className="bs-sub">Khả dụng {formatQuantity(row.stock.available)}</small>}</td>}
        <td><AxStatus tone={row.active ? "success" : "danger"}>{row.active ? "Đang dùng" : "Ngừng dùng"}</AxStatus><small className="bs-sub">{[row.saleEnabled && "Bán", row.purchaseEnabled && "Mua"].filter(Boolean).join(" · ") || "Không bán/mua"}</small></td>
      </tr>
      {expanded && <tr id={`material-${row.id}`}><td colSpan={columns} style={{ background: "#F4F9FE" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 24 }}>
          {showStock && <section><h4 className="hx-label">Tồn theo kho</h4>{row.stock?.warehouses.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{row.stock.warehouses.map((item) => <li key={item.name}><b>{item.name}</b> · Trong kho {formatQuantity(item.onHand)} {row.uom} · khả dụng {formatQuantity(item.available)}</li>)}</ul> : <p className="hx-muted" style={{ margin: 0 }}>Chưa có tồn kho.</p>}</section>}
          <section><h4 className="hx-label">Quy đổi đơn vị</h4>{row.conversions.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{row.conversions.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="hx-muted" style={{ margin: 0 }}>Chỉ dùng đơn vị gốc {row.uom}.</p>}</section>
          <section><Link className="hx-btn sm" href={href}>Xem chi tiết vật tư</Link></section>
        </div>
      </td></tr>}
    </Fragment>;
  })}</tbody>;
}
