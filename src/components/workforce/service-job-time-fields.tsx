"use client";

import { useState } from "react";

/** "2026-10-23T08:00" plus some hours, as the same local datetime text. */
export function addHours(local: string, hours: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return "";
  const [, y, m, d, h, min] = match.map(Number);
  const value = new Date(Date.UTC(y, m - 1, d, h + hours, min));
  return value.toISOString().slice(0, 16);
}

/** FB8: start and expected end; the end follows the start (+4 hours) until it is changed by hand. */
export function ServiceJobTimeFields({ defaultStart }: { defaultStart: string }) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(() => addHours(defaultStart, 4));
  const [ownEnd, setOwnEnd] = useState(false);
  return <>
    <div className="field"><label htmlFor="service-start">Bắt đầu</label>
      <input id="service-start" type="datetime-local" name="scheduledStart" value={start} required
        onChange={(event) => { setStart(event.target.value); if (!ownEnd) setEnd(addHours(event.target.value, 4)); }} /></div>
    <div className="field"><label htmlFor="service-end">Kết thúc dự kiến</label>
      <input id="service-end" type="datetime-local" name="scheduledEnd" value={end} min={start} required
        onChange={(event) => { setEnd(event.target.value); setOwnEnd(true); }} />
      <small className="muted">Dùng để tránh trùng lịch thợ, xe, máy; không ảnh hưởng tiền tính khách.</small></div>
  </>;
}
