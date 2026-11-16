"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveQuietHoursAction } from "@/modules/settings/automation-actions";
import { DEFAULT_QUIET_HOURS, QUIET_EXEMPTIONS, minuteToTime, timeToMinute, type QuietExemption, type QuietHours } from "@/modules/settings/automation-presentation";
import styles from "./notification-rules.module.css";

/** D93 (4) "Giờ yên lặng": per branch; pushes are held and sent as one combined push per device when the quiet hours end. */
export function QuietHoursForm({ value, onSaved }: { value: QuietHours | null; onSaved: (message: string) => void }) {
  const router = useRouter();
  const saved = value ?? DEFAULT_QUIET_HOURS;
  const [enabled, setEnabled] = useState(saved.enabled);
  const [start, setStart] = useState(minuteToTime(saved.start_minute));
  const [end, setEnd] = useState(minuteToTime(saved.end_minute));
  const [exempt, setExempt] = useState<QuietExemption[]>(saved.exempt_keys);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; conflict: boolean } | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const startMinute = timeToMinute(start);
  const endMinute = timeToMinute(end);
  const invalid = startMinute === null || endMinute === null ? "Nhập giờ dạng HH:MM." : startMinute === endMinute ? "Giờ bắt đầu và giờ kết thúc phải khác nhau." : null;

  async function save() {
    if (invalid || startMinute === null || endMinute === null) { setMessage({ text: invalid ?? "Nhập giờ dạng HH:MM.", conflict: false }); return; }
    setBusy(true);
    try {
      const result = await saveQuietHoursAction({ enabled, startMinute, endMinute, exemptKeys: exempt, expectedVersion: value?.version ?? null, operationId });
      if (result.ok) { setMessage(null); setOperationId(crypto.randomUUID()); onSaved(result.message); return; }
      setMessage({ text: result.message, conflict: result.message.includes("người khác sửa") });
    } catch {
      setMessage({ text: "Chưa rõ đã lưu chưa (mất kết nối). Tải lại trang để kiểm tra.", conflict: false });
    } finally {
      setBusy(false);
    }
  }

  return <section className={`${styles.panel} ${styles.quiet}`} aria-labelledby="quiet-title">
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className={styles.panelHead}><h3 id="quiet-title">Giờ yên lặng</h3>
        <p>Ban đêm không rung điện thoại. Tin trong giờ yên lặng vẫn vào chuông trong app; mỗi máy nhận một tin gộp khi hết giờ.</p></div>
      <label className={styles.option}><input type="checkbox" checked={enabled} onChange={(input) => setEnabled(input.target.checked)} />
        <span><b>Bật giờ yên lặng cho chi nhánh này</b><small>Áp dụng cho điện thoại nhân viên, thợ và khách</small></span></label>
      <div className={styles.times}>
        <div className="field"><label htmlFor="quiet-start">Từ</label><input id="quiet-start" type="time" value={start} required onChange={(input) => setStart(input.target.value)} /></div>
        <div className="field"><label htmlFor="quiet-end">Đến</label><input id="quiet-end" type="time" value={end} required onChange={(input) => setEnd(input.target.value)} /></div>
      </div>
      <fieldset className={styles.eventGroup}><legend>Vẫn báo ngay, kể cả giờ yên lặng</legend>
        {QUIET_EXEMPTIONS.map((item) => <label key={item.value} className={styles.option}>
          <input type="checkbox" checked={exempt.includes(item.value)}
            onChange={(input) => setExempt(input.target.checked ? [...exempt, item.value] : exempt.filter((key) => key !== item.value))} />
          <span><b>{item.label}</b></span></label>)}</fieldset>
      {invalid && <p className={styles.noteWarn}>{invalid}</p>}
      {message && <div className="form-message" role="alert">{message.text}
        {message.conflict && <> <button type="button" className={styles.linkButton} onClick={() => router.refresh()}>Tải bản mới</button></>}</div>}
      <div className="form-actions"><button type="submit" className="button button-primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu giờ yên lặng"}</button></div>
    </form>
    <div className={styles.example}><b>Ví dụ lúc {endMinute === null ? end : minuteToTime(endMinute)}</b>
      <div className={styles.bubble}><span className={styles.bubbleHead}><span>Hiền Xa · {endMinute === null ? end : minuteToTime(endMinute)}</span></span>
        <b>Trong giờ yên lặng có 3 thông báo</b><span>Đơn mới từ khách: Anh Tuấn · Đơn mua nháp cần duyệt: PO-0102 · Khách hủy đơn SO-0415</span></div>
      <p className={styles.note}>Không áp dụng cho webhook (gửi ngay như hiện nay) và “Gửi thử”.</p></div>
  </section>;
}
