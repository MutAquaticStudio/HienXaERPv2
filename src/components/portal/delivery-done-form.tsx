"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/portal/portal.module.css";
import { formatQuantity } from "@/lib/core/quantity";
import { soldQuantityLabel } from "@/modules/portal/presentation";
import type { WorkerJob } from "@/modules/portal/types";
import { JobPhotoGrid, useJobPhotos } from "./job-photos";

type Delivery = NonNullable<WorkerJob["delivery"]>;
type Line = Delivery["lines"][number];

/** Sold-unit ratio of a line (base per sold unit), or null when the line is entered in its base unit. */
export function soldRatio(line: Line) {
  const numerator = Number(line.sold_numerator ?? 0), denominator = Number(line.sold_denominator ?? 0);
  return line.sold_unit && line.sold_unit !== line.unit && numerator > 0 && denominator > 0 && numerator !== denominator
    ? new Decimal(line.sold_numerator!).div(line.sold_denominator!) : null;
}

/** What the worker typed (sold unit when there is one) as an exact base quantity, or null. */
export function enteredBase(value: string, line: Line): string | null {
  const text = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) return null;
  const ratio = soldRatio(line);
  const base = ratio ? new Decimal(text).mul(ratio) : new Decimal(text);
  return base.decimalPlaces() <= 6 ? base.toFixed() : null;
}

/** A base quantity shown in the line's sold unit, for the quantity inputs. */
export function inSoldUnit(base: string, line: Line) {
  const ratio = soldRatio(line);
  return (ratio ? new Decimal(base).div(ratio).toDecimalPlaces(6, Decimal.ROUND_DOWN) : new Decimal(base)).toFixed();
}

/**
 * "Đã giao": one tap opens the camera, photos are shrunk on the phone and uploaded, then "Xác nhận đã giao" reports every
 * line as loaded. "Giao thiếu / Không giao được" takes the quantities instead; a note is welcome but not required (FB7).
 * The report is the verification: the order shows as delivered to the customer right away.
 */
export function DeliveryDoneForm({ workItemId, version, delivery, receiverName, savedPhotoIds = [] }: {
  workItemId: string; version: number; delivery: Delivery; receiverName?: string; savedPhotoIds?: string[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"DONE" | "OTHER">("DONE");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(delivery.lines.map((line) =>
    [line.id, inSoldUnit(line.loaded_base_quantity ?? line.reportable_base_quantity ?? "0", line)])));
  const [receiver, setReceiver] = useState(receiverName ?? "");
  const [note, setNote] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const photos = useJobPhotos(workItemId, savedPhotoIds,
    () => setMessage({ error: true, text: "Có ảnh chưa tải lên được. Kiểm tra kết nối, xóa ảnh lỗi rồi chụp lại." }));
  const { ready, uploading } = photos;

  if (delivery.awaiting_handoff) return <div className={styles.form}>
    <button type="button" className={styles.button} disabled>Lấy hàng lên xe trước</button>
    <p className={styles.hint}>Xác nhận đã lấy hàng lên xe thì nút &quot;Đã giao&quot; sẽ mở.</p>
  </div>;

  async function send() {
    if (sending || uploading) return;
    let lines: { deliveryLineId: string; actualBaseQuantity: string }[] | null = null;
    if (mode === "OTHER") {
      lines = [];
      for (const line of delivery.lines) {
        const base = enteredBase(quantities[line.id] ?? "", line);
        if (base === null || new Decimal(base).gt(line.reportable_base_quantity)) {
          setMessage({ error: true, text: `Số lượng ${line.material_name} phải là số hợp lệ, không vượt lượng đã lấy lên xe.` });
          document.getElementById(`done-${line.id}`)?.focus();
          return;
        }
        lines.push({ deliveryLineId: line.id, actualBaseQuantity: base });
      }
      const nothing = lines.every((line) => new Decimal(line.actualBaseQuantity).isZero());
      if (!nothing && !ready.length) { setMessage({ error: true, text: "Chụp ít nhất 1 ảnh hàng đã giao." }); return; }
    } else if (!ready.length) { photos.openCamera(); return; }
    setSending(true);
    setMessage({ error: false, text: "Đang gửi..." });
    try {
      const response = await fetch("/api/portal/delivery-done", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId, operationId, lines, receiverName: receiver, note, evidenceIds: ready,
          expectedVersion: version, expectedDeliveryVersion: delivery.version, expectedAssignmentVersion: delivery.assignment_version }),
      });
      const body = await response.json() as { error?: string; unknown?: boolean };
      if (!response.ok) {
        // A refusal is final for this attempt; an unclear outcome keeps the operation so pressing again only checks.
        if (!body.unknown) setOperationId(crypto.randomUUID());
        setMessage({ error: true, text: body.error ?? "Không gửi được kết quả." });
        return;
      }
      setMessage({ error: false, text: "Đã báo giao hàng." });
      router.push("/work?notice=delivery-reported");
    } catch {
      setMessage({ error: true, text: "Mất kết nối. Ảnh đã tải vẫn được giữ; kết nối lại rồi bấm gửi lần nữa." });
    } finally {
      setSending(false);
    }
  }

  const choose = (next: "DONE" | "OTHER") => { if (next === mode) return; setMode(next); setMessage(null); setOperationId(crypto.randomUUID()); };
  return <div className={styles.form}>
    {/* Concept "Báo đã giao": Giao đủ / Giao thiếu, then the lines (x / y in DONE), photos, receiver, one big button. */}
    <div className={styles.segmented} role="radiogroup" aria-label="Kết quả giao">
      <button type="button" role="radio" aria-checked={mode === "DONE"} disabled={sending} onClick={() => choose("DONE")}>Giao đủ</button>
      <button type="button" role="radio" aria-checked={mode === "OTHER"} disabled={sending} onClick={() => choose("OTHER")}>Giao thiếu / không giao được</button>
    </div>
    {mode === "DONE" && <ul className={styles.doneLines}>{delivery.lines.map((line) => <li key={line.id}>
      <span>{line.material_name}</span><strong>{soldQuantityLabel(line.reportable_base_quantity, line, formatQuantity)}</strong></li>)}</ul>}
    {mode === "OTHER" && <div className={styles.form}>
      {delivery.lines.map((line) => <div className={styles.field} key={line.id}>
        <label htmlFor={`done-${line.id}`}>{line.material_name} · đã lấy {soldQuantityLabel(line.reportable_base_quantity, line, formatQuantity)}</label>
        <input id={`done-${line.id}`} inputMode="decimal" value={quantities[line.id] ?? ""} disabled={sending}
          onChange={(event) => setQuantities((all) => ({ ...all, [line.id]: event.target.value }))} />
        <span className={styles.hint}>Số lượng khách nhận{line.sold_unit && soldRatio(line) ? ` (${line.sold_unit})` : ` (${line.unit})`}; 0 nếu không giao được.</span>
      </div>)}
      <div className={styles.field}><label htmlFor="done-note">Ghi chú (không bắt buộc)</label>
        <textarea id="done-note" value={note} maxLength={1000} disabled={sending} onChange={(event) => setNote(event.target.value)} /></div>
    </div>}
    <JobPhotoGrid photos={photos} label="Ảnh giao hàng" disabled={sending} alwaysShow={mode === "OTHER"} />
    <div className={styles.field}><label htmlFor="done-receiver">Người nhận</label>
      <input id="done-receiver" value={receiver} maxLength={120} disabled={sending} onChange={(event) => setReceiver(event.target.value)} /></div>
    {message && <p className={message.error ? styles.error : styles.status} role={message.error ? "alert" : "status"}>{message.text}</p>}
    <button type="button" className={`${styles.button} ${styles.buttonCommerce} ${styles.stickyAction}`} disabled={sending || uploading} onClick={() => { void send(); }}>
      {sending ? "Đang gửi..." : mode === "OTHER" ? "Gửi báo cáo giao" : ready.length ? `Xác nhận đã giao (${ready.length} ảnh)` : "Đã giao · chụp ảnh"}</button>
  </div>;
}
