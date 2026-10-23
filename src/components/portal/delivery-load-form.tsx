"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "@/components/portal/portal.module.css";
import { formatQuantity } from "@/lib/core/quantity";
import { soldQuantityLabel } from "@/modules/portal/presentation";
import type { WorkerJob } from "@/modules/portal/types";
import { enteredBase, inSoldUnit, soldRatio } from "./delivery-done-form";
import { JobPhotoGrid, useJobPhotos } from "./job-photos";

type Delivery = NonNullable<WorkerJob["delivery"]>;

/**
 * FB7 "Đã lấy hàng lên xe": the assigned worker photographs the loaded truck and confirms; the goods leave the warehouse and
 * the job is on its way. Quantities default to the plan; "Lấy thiếu" lets the worker enter what was actually loaded.
 */
export function DeliveryLoadForm({ workItemId, version, delivery }: { workItemId: string; version: number; delivery: Delivery }) {
  const router = useRouter();
  const [short, setShort] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(delivery.lines.map((line) => [line.id, inSoldUnit(line.planned_base_quantity, line)])));
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const photos = useJobPhotos(workItemId, [],
    () => setMessage({ error: true, text: "Có ảnh chưa tải lên được. Kiểm tra kết nối, xóa ảnh lỗi rồi chụp lại." }));
  const { ready, uploading } = photos;

  async function send() {
    if (sending || uploading) return;
    let lines: { deliveryLineId: string; loadedBaseQuantity: string }[] | null = null;
    if (short) {
      lines = [];
      for (const line of delivery.lines) {
        const base = enteredBase(quantities[line.id] ?? "", line);
        if (base === null || new Decimal(base).gt(line.planned_base_quantity)) {
          setMessage({ error: true, text: `Số lượng ${line.material_name} phải là số hợp lệ, không vượt số cần giao.` });
          document.getElementById(`load-${line.id}`)?.focus();
          return;
        }
        lines.push({ deliveryLineId: line.id, loadedBaseQuantity: base });
      }
      if (lines.every((line) => new Decimal(line.loadedBaseQuantity).isZero())) {
        setMessage({ error: true, text: "Phải lấy ít nhất một dòng hàng. Nếu không lấy được hàng, bấm Từ chối việc." });
        return;
      }
    }
    if (!ready.length) { photos.openCamera(); return; }
    setSending(true);
    setMessage({ error: false, text: "Đang gửi..." });
    try {
      const response = await fetch("/api/portal/delivery-loaded", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId, operationId, lines, evidenceIds: ready,
          expectedVersion: version, expectedDeliveryVersion: delivery.version, expectedAssignmentVersion: delivery.assignment_version }),
      });
      const body = await response.json() as { error?: string; unknown?: boolean };
      if (!response.ok) {
        if (!body.unknown) setOperationId(crypto.randomUUID());
        setMessage({ error: true, text: body.error ?? "Không gửi được." });
        return;
      }
      setMessage({ error: false, text: "Đã lấy hàng lên xe. Giao xong thì bấm Đã giao." });
      router.refresh();
    } catch {
      setMessage({ error: true, text: "Mất kết nối. Ảnh đã tải vẫn được giữ; kết nối lại rồi bấm gửi lần nữa." });
    } finally {
      setSending(false);
    }
  }

  return <div className={styles.form}>
    {short && delivery.lines.map((line) => <div className={styles.field} key={line.id}>
      <label htmlFor={`load-${line.id}`}>{line.material_name} · cần giao {soldQuantityLabel(line.planned_base_quantity, line, formatQuantity)}</label>
      <input id={`load-${line.id}`} inputMode="decimal" value={quantities[line.id] ?? ""} disabled={sending}
        onChange={(event) => setQuantities((all) => ({ ...all, [line.id]: event.target.value }))} />
      <span className={styles.hint}>Số lượng thực lấy lên xe ({line.sold_unit && soldRatio(line) ? line.sold_unit : line.unit}).</span>
    </div>)}
    <JobPhotoGrid photos={photos} label="Ảnh hàng trên xe" disabled={sending} />
    {message && <p className={message.error ? styles.error : styles.status} role={message.error ? "alert" : "status"}>{message.text}</p>}
    <button type="button" className={`${styles.button} ${styles.stickyAction}`} disabled={sending || uploading} onClick={() => { void send(); }}>
      {sending ? "Đang gửi..." : ready.length ? `Xác nhận đã lấy hàng lên xe (${ready.length} ảnh)` : "Đã lấy hàng lên xe · chụp ảnh"}</button>
    <button type="button" className={styles.link} disabled={sending} onClick={() => { setShort(!short); setMessage(null); setOperationId(crypto.randomUUID()); }}>
      {short ? "Lấy đủ như phiếu giao" : "Lấy thiếu hàng"}</button>
  </div>;
}
