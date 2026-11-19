"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { TodayItem } from "@/modules/dashboard/today";

/** D56 "Cần xử lý hôm nay": every row on a wide screen; on a phone the first three, then "Xem thêm". */
export function TodayList({ items }: { items: TodayItem[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="empty-inline today-empty">Không còn việc nào cần xử lý. Việc mới (phiếu chờ phân xe, tiền chưa ghi, đơn chờ duyệt…) sẽ hiện ở đây.</p>;
  return <>
    <ul className={`today-list${all ? " show-all" : ""}`}>
      {items.map((item) => <li key={item.key}><Link href={item.href}>
        <strong className={`today-count tone-${item.tone}`}>{item.count}</strong>
        <span className="today-text"><span>{item.title}</span>{item.detail && <small>{item.detail}</small>}</span>
        <span className="today-action">{item.action}<ChevronRight aria-hidden size={16} /></span>
      </Link></li>)}
    </ul>
    {items.length > 3 && !all && <button type="button" className="today-more" onClick={() => setAll(true)}>Xem thêm {items.length - 3} việc</button>}
  </>;
}
