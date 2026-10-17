"use client";

import Decimal from "decimal.js";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/portal/portal.module.css";
import { formatQuantity } from "@/lib/core/quantity";
import { soldQuantityLabel } from "@/modules/portal/presentation";
import type { WorkerJob } from "@/modules/portal/types";
import { shrinkImage } from "./shrink-image";

type Delivery = NonNullable<WorkerJob["delivery"]>;
type Line = Delivery["lines"][number];
type Photo = { key: string; id?: string; preview: string; state: "uploading" | "ready" | "failed" };
const MAX_PHOTOS = 5;

/** Sold-unit ratio of a line (base per sold unit), or null when the line is entered in its base unit. */
function soldRatio(line: Line) {
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

/**
 * A3 "Đã giao": one tap opens the camera, photos are shrunk on the phone and uploaded, then "Xác nhận đã giao" reports
 * every line as loaded. "Giao thiếu / Không giao được" takes the quantities and a reason instead.
 */
export function DeliveryDoneForm({ workItemId, version, delivery, receiverName, savedPhotoIds = [] }: {
  workItemId: string; version: number; delivery: Delivery; receiverName?: string; savedPhotoIds?: string[];
}) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>(() => savedPhotoIds.slice(0, MAX_PHOTOS).map((id) => ({ key: id, id, preview: `/api/evidence/${id}/download`, state: "ready" })));
  const [mode, setMode] = useState<"DONE" | "OTHER">("DONE");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(delivery.lines.map((line) => {
    const loaded = new Decimal(line.loaded_base_quantity ?? line.reportable_base_quantity ?? "0");
    const ratio = soldRatio(line);
    return [line.id, (ratio ? loaded.div(ratio).toDecimalPlaces(6, Decimal.ROUND_DOWN) : loaded).toFixed()];
  })));
  const [receiver, setReceiver] = useState(receiverName ?? "");
  const [note, setNote] = useState("");
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const ready = photos.filter((photo) => photo.state === "ready" && photo.id);
  const uploading = photos.some((photo) => photo.state === "uploading");

  // Local previews are released when the form goes away.
  const shown = useRef(photos);
  useEffect(() => { shown.current = photos; }, [photos]);
  useEffect(() => () => { for (const photo of shown.current) if (photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview); }, []);

  if (delivery.awaiting_handoff) return <div className={styles.form}>
    <button type="button" className={styles.button} disabled>Chờ kho bàn giao hàng lên xe</button>
    <p className={styles.hint}>Khi kho ghi nhận hàng đã lên xe, nút &quot;Đã giao&quot; sẽ mở. Tải lại công việc để cập nhật.</p>
  </div>;

  async function addPhotos(files: FileList | null) {
    const chosen = [...(files ?? [])].slice(0, MAX_PHOTOS - photos.length);
    if (camera.current) camera.current.value = "";
    for (const original of chosen) {
      const key = crypto.randomUUID();
      const file = await shrinkImage(original);
      setPhotos((all) => [...all, { key, preview: URL.createObjectURL(file), state: "uploading" }]);
      const form = new FormData();
      form.set("file", file);
      form.set("context", "WORK_RESULT");
      form.set("workItemId", workItemId);
      form.set("operationId", key);
      try {
        const response = await fetch("/api/portal/evidence/upload", { method: "POST", body: form });
        const body = await response.json() as { evidenceId?: string; error?: string };
        if (!response.ok || !body.evidenceId) throw new Error(body.error);
        setPhotos((all) => all.map((photo) => photo.key === key ? { ...photo, id: body.evidenceId, state: "ready" } : photo));
      } catch {
        setPhotos((all) => all.map((photo) => photo.key === key ? { ...photo, state: "failed" } : photo));
        setMessage({ error: true, text: "Có ảnh chưa tải lên được. Kiểm tra kết nối, xóa ảnh lỗi rồi chụp lại." });
      }
    }
  }

  function removePhoto(key: string) {
    setPhotos((all) => all.filter((photo) => {
      if (photo.key === key && photo.preview.startsWith("blob:")) URL.revokeObjectURL(photo.preview);
      return photo.key !== key;
    }));
  }

  async function send() {
    if (sending || uploading) return;
    let lines: { deliveryLineId: string; actualBaseQuantity: string }[] | null = null;
    if (mode === "OTHER") {
      lines = [];
      for (const line of delivery.lines) {
        const base = enteredBase(quantities[line.id] ?? "", line);
        if (base === null || new Decimal(base).gt(line.reportable_base_quantity)) {
          setMessage({ error: true, text: `Số lượng ${line.material_name} phải là số hợp lệ, không vượt lượng đã lấy lên xe.` });
          return;
        }
        lines.push({ deliveryLineId: line.id, actualBaseQuantity: base });
      }
      const nothing = lines.every((line) => new Decimal(line.actualBaseQuantity).isZero());
      if (nothing && note.trim().length < 3) { setMessage({ error: true, text: "Ghi lý do không giao được (ít nhất 3 ký tự)." }); return; }
      if (!nothing && !ready.length) { setMessage({ error: true, text: "Chụp ít nhất 1 ảnh hàng đã giao." }); return; }
    } else if (!ready.length) { camera.current?.click(); return; }
    setSending(true);
    setMessage({ error: false, text: "Đang gửi..." });
    try {
      const response = await fetch("/api/portal/delivery-done", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ workItemId, operationId, lines, receiverName: receiver, note, evidenceIds: ready.map((photo) => photo.id),
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

  return <div className={styles.form}>
    <input ref={camera} type="file" accept="image/*" capture="environment" multiple hidden aria-label="Chụp ảnh giao hàng"
      onChange={(event) => { void addPhotos(event.target.files); }} />
    {mode === "OTHER" && <div className={styles.form}>
      {delivery.lines.map((line) => <div className={styles.field} key={line.id}>
        <label htmlFor={`done-${line.id}`}>{line.material_name} · đã lấy {soldQuantityLabel(line.reportable_base_quantity, line, formatQuantity)}</label>
        <input id={`done-${line.id}`} inputMode="decimal" value={quantities[line.id] ?? ""} disabled={sending}
          onChange={(event) => setQuantities((all) => ({ ...all, [line.id]: event.target.value }))} />
        <span className={styles.hint}>Số lượng khách nhận{line.sold_unit && soldRatio(line) ? ` (${line.sold_unit})` : ` (${line.unit})`}; 0 nếu không giao được.</span>
      </div>)}
      <div className={styles.field}><label htmlFor="done-note">Lý do / ghi chú</label>
        <textarea id="done-note" value={note} maxLength={1000} disabled={sending} onChange={(event) => setNote(event.target.value)} /></div>
    </div>}
    {(photos.length > 0 || mode === "OTHER") && <div className={styles.photoGrid} aria-label="Ảnh giao hàng">
      {photos.map((photo, index) => <figure key={photo.key} className={styles.photo}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or the private evidence route */}
        <img src={photo.preview} alt={`Ảnh ${index + 1}`} />
        <figcaption>{photo.state === "uploading" ? "Đang tải..." : photo.state === "failed" ? "Lỗi tải" : "Đã tải"}</figcaption>
        <button type="button" className={styles.buttonSecondary} onClick={() => removePhoto(photo.key)} disabled={sending}>Xóa</button>
      </figure>)}
      {photos.length < MAX_PHOTOS && <button type="button" className={styles.buttonSecondary} onClick={() => camera.current?.click()} disabled={sending}>
        {photos.length ? "+ Chụp thêm" : "Chụp ảnh"}</button>}
    </div>}
    <div className={styles.field}><label htmlFor="done-receiver">Người nhận</label>
      <input id="done-receiver" value={receiver} maxLength={120} disabled={sending} onChange={(event) => setReceiver(event.target.value)} /></div>
    {message && <p className={message.error ? styles.error : styles.status} role={message.error ? "alert" : "status"}>{message.text}</p>}
    <button type="button" className={styles.button} disabled={sending || uploading} onClick={() => { void send(); }}>
      {sending ? "Đang gửi..." : mode === "OTHER" ? "Gửi báo cáo giao" : ready.length ? `Xác nhận đã giao (${ready.length} ảnh)` : "Đã giao · chụp ảnh"}</button>
    <button type="button" className={styles.link} disabled={sending} onClick={() => { setMode(mode === "DONE" ? "OTHER" : "DONE"); setMessage(null); setOperationId(crypto.randomUUID()); }}>
      {mode === "DONE" ? "Giao thiếu / Không giao được" : "Giao đủ như đã lấy lên xe"}</button>
  </div>;
}
