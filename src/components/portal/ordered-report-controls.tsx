"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, RefreshCw } from "lucide-react";

import styles from "@/components/portal/ordered-report.module.css";
import { orderedReportHref, parseDayInput, periodProblem } from "@/modules/portal/ordered-report";

/** A date typed in full (4-digit year); anything shorter is still being typed and is not judged yet. */
const COMPLETE = /^\s*\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{4}\s*$/;
export const FROM_INPUT_ID = "ordered-report-from";

/**
 * "Từ ngày" / "Đến ngày": text boxes in dd/mm/yyyy that apply by themselves — as soon as both hold a real day and the
 * period is usable, the address changes and the report follows. A wrong date is told in words and nothing is applied.
 */
export function PeriodDates({ from, to, fromText, toText, note }: {
  /** The period shown now, as business days. */
  from: string; to: string;
  /** What the boxes start with (dd/mm/yyyy, or what was typed in a wrong address). */
  fromText: string; toText: string;
  /** The sentence under the boxes: the period in words, or why the address could not be used. */
  note: { text: string; bad: boolean };
}) {
  const router = useRouter();
  const [values, setValues] = useState({ from: fromText, to: toText });
  const [problem, setProblem] = useState<string | null>(null);
  const noteId = useId();

  function change(next: { from: string; to: string }) {
    setValues(next);
    if (!COMPLETE.test(next.from) || !COMPLETE.test(next.to)) { setProblem(null); return; }
    const start = parseDayInput(next.from);
    const end = parseDayInput(next.to);
    const found = start && end ? periodProblem(start, end) : "Ngày chưa đúng. Nhập theo dạng ngày/tháng/năm, ví dụ 17/11/2026.";
    setProblem(found);
    if (found || !start || !end || (start === from && end === to)) return;
    router.replace(orderedReportHref({ from: start, to: end }));
  }

  const shown = problem ? { text: problem, bad: true } : note;
  return <>
    <div className={styles.dates}>
      <label>Từ ngày
        <input id={FROM_INPUT_ID} inputMode="numeric" autoComplete="off" placeholder="dd/mm/yyyy" value={values.from} aria-describedby={noteId}
          aria-invalid={shown.bad || undefined} onChange={(event) => change({ ...values, from: event.target.value })} />
      </label>
      <label>Đến ngày
        <input inputMode="numeric" autoComplete="off" placeholder="dd/mm/yyyy" value={values.to} aria-describedby={noteId}
          aria-invalid={shown.bad || undefined} onChange={(event) => change({ ...values, to: event.target.value })} />
      </label>
    </div>
    <p className={`${styles.fnote} ${shown.bad ? styles.bad : ""}`} id={noteId} role="status">{shown.text}</p>
  </>;
}

/** "Thử lại" on the error panel: the page asks the server again. */
export function RetryButton() {
  const router = useRouter();
  return <button type="button" className={styles.retry} onClick={() => router.refresh()}><RefreshCw aria-hidden size={18} />Thử lại</button>;
}

/** "Chọn ngày khác" on the empty panel: puts the cursor in "Từ ngày". */
export function PickDateButton() {
  return <button type="button" className={styles.pick} onClick={() => {
    const input = document.getElementById(FROM_INPUT_ID);
    if (input instanceof HTMLInputElement) { input.scrollIntoView?.({ block: "center" }); input.focus(); input.select(); }
  }}><CalendarDays aria-hidden size={18} />Chọn ngày khác</button>;
}
