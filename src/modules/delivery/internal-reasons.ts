/**
 * Internal notes the system writes into `delivery_results.missing_arrival_reason` when a result is reported from "Đang giao"
 * without the "Đã tới nơi" step (Spec: that step may be skipped with a reason) and nobody typed one. They are for the office
 * history only: D96 (D4) — the customer's "Giao thiếu / Chưa giao được" push never shows them (the database function
 * `private.customer_delivery_reason`, migration 20261117110500, lists the same texts), the customer reads
 * "Cửa hàng sẽ liên hệ lại" instead.
 */
export const OFFICE_REPORTED_ARRIVAL_NOTE = "Nhân viên báo giao thay thợ";
export const WORKER_MISSING_ARRIVAL_NOTE = "Thợ chưa bấm Đã tới nơi";
export const INTERNAL_ARRIVAL_NOTES = [OFFICE_REPORTED_ARRIVAL_NOTE, WORKER_MISSING_ARRIVAL_NOTE] as const;
