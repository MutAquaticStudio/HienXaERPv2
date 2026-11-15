"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";
import type { WorkerPoolDelivery } from "@/modules/portal/types";

const zone = { timeZone: "Asia/Ho_Chi_Minh" } as const;
const clock = new Intl.DateTimeFormat("vi-VN", { ...zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { ...zone, day: "2-digit", month: "2-digit" });
const when = (value: string) => `${clock.format(new Date(value))} ${dayMonth.format(new Date(value))}`;
const quantity = (value: string) => Number(value).toLocaleString("vi-VN", { maximumFractionDigits: 6 });

/** D79: a delivery waiting for dispatch. The worker picks a free truck (the suggestion is pre-selected) and takes it. */
export function ClaimDeliveryCard({ delivery }: { delivery: WorkerPoolDelivery }) {
  const suggested = delivery.vehicles.some((vehicle) => vehicle.vehicle_id === delivery.suggested_vehicle_id)
    ? delivery.suggested_vehicle_id! : delivery.vehicles[0]?.vehicle_id ?? "";
  const [vehicleId, setVehicleId] = useState(suggested);
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [message, setMessage] = useState("");
  const operation = useRef({ key: "", id: "" });
  const router = useRouter();
  const chosen = delivery.vehicles.find((vehicle) => vehicle.vehicle_id === vehicleId);
  const groupId = `claim-${delivery.id}`;

  async function claim() {
    if (!chosen) return;
    // The same choice retried after an unclear outcome reuses its operation id, so it is never taken twice.
    if (operation.current.key !== vehicleId) operation.current = { key: vehicleId, id: crypto.randomUUID() };
    setStatus("busy");
    setMessage("Đang nhận phiếu giao...");
    try {
      const response = await fetch("/api/portal/deliveries/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deliveryId: delivery.id, vehicleId, version: delivery.version, operationId: operation.current.id }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; workItemId?: string };
      if (!response.ok || !body.workItemId) throw new Error(body.error ?? "Chưa nhận được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.");
      router.push("/work/jobs/" + body.workItemId);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Chưa nhận được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.");
    }
  }

  return (
    <article className={styles.card + " " + styles.cardAccent}>
      <span className={styles.badge + " " + styles.badgeWarm}>Phiếu giao chờ người nhận</span>
      <h2>{delivery.site_name ?? delivery.customer_name ?? delivery.number}</h2>
      <div className={styles.meta}>
        <span>{delivery.number}</span>
        <span>{delivery.address ?? "Địa điểm sẽ cập nhật"}</span>
      </div>
      <ul className={styles.claimLines} aria-label="Hàng cần giao">
        {delivery.lines.map((line, index) => <li key={index}><span>{line.material_name}</span><strong>{quantity(line.quantity)} {line.unit}</strong></li>)}
      </ul>
      <div role="radiogroup" aria-labelledby={groupId} className={styles.svcRadios}>
        <p id={groupId} className={styles.claimLabel}>Chọn xe chở</p>
        {delivery.vehicles.map((vehicle) => <label key={vehicle.vehicle_id} className={styles.svcRadio}>
          <input type="radio" name={groupId} value={vehicle.vehicle_id} checked={vehicleId === vehicle.vehicle_id} disabled={status === "busy"}
            onChange={() => setVehicleId(vehicle.vehicle_id)} />
          <span>
            <strong>{vehicle.code}{vehicle.vehicle_id === delivery.suggested_vehicle_id ? " · Gợi ý" : ""}</strong>
            <small>Rảnh lúc {when(vehicle.start_at)}{vehicle.plate_number && vehicle.plate_number !== vehicle.code ? ` · ${vehicle.plate_number}` : ""}</small>
          </span>
        </label>)}
      </div>
      <div className={styles.form}>
        <button className={styles.button} disabled={status === "busy" || !chosen} onClick={claim} type="button">
          {status === "busy" ? "Đang nhận phiếu giao" : chosen ? `Nhận phiếu giao, đi lúc ${when(chosen.start_at)}` : "Nhận phiếu giao này"}
        </button>
        {message ? <p className={styles.status + " " + (status === "error" ? styles.error : "")} role="status">{message}</p> : null}
      </div>
    </article>
  );
}
