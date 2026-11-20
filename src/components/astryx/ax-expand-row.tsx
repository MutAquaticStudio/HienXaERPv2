"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Một dòng danh sách có mũi tên "Xem nhanh {mã}" mở rộng phần chi tiết ngay dưới (aria-expanded / aria-controls). */
export function AxExpandRow({ id, label, template, cells, detail, muted }: { id: string; label: string; template: string; cells: ReactNode[]; detail: ReactNode; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  const panel = `quick-${id}`;
  return <div className={`hx-row${open ? " open" : ""}`} style={muted ? { opacity: 0.6 } : undefined}>
    <div className="hx-tr" style={{ gridTemplateColumns: template }}>
      <span><button type="button" className="hx-exp" aria-expanded={open} aria-controls={panel} aria-label={`${open ? "Thu gọn" : "Xem nhanh"} ${label}`} onClick={() => setOpen((value) => !value)}>
        {open ? <ChevronDown className="hx-ico" aria-hidden /> : <ChevronRight className="hx-ico" aria-hidden />}</button></span>
      {cells.map((cell, index) => <span key={index}>{cell}</span>)}
    </div>
    {open && <div id={panel} className="hx-quick">{detail}</div>}
  </div>;
}
