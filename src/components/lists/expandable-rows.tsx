"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

/** A list row: its cells (rendered by the server page), what opens under it, and a name for the toggle. */
export type ExpandableRow = { id: string; label: string; cells: ReactNode; detail: ReactNode; className?: string };

/**
 * D29 list pattern: the row still opens the record, and the arrow opens a summary right under it without leaving
 * the list (one at a time, like KiotViet). `columns` counts the arrow column too.
 */
export function ExpandableRows({ rows, columns }: { rows: readonly ExpandableRow[]; columns: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return <tbody>{rows.map((row) => {
    const expanded = open === row.id;
    const detailId = `row-detail-${row.id}`;
    return <Fragment key={row.id}>
      <tr className={[row.className, expanded ? "row-open" : ""].filter(Boolean).join(" ") || undefined}>
        <td className="row-toggle"><button type="button" className="icon-button" aria-expanded={expanded} aria-controls={detailId}
          aria-label={`${expanded ? "Thu gọn" : "Xem nhanh"} ${row.label}`} onClick={() => setOpen(expanded ? null : row.id)}>
          {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        </button></td>
        {row.cells}
      </tr>
      {expanded && <tr id={detailId} className="row-expansion"><td colSpan={columns}>{row.detail}</td></tr>}
    </Fragment>;
  })}</tbody>;
}
