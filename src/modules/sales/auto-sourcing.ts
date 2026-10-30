import { createHash } from "node:crypto";
import type { createServerSupabase } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

/** A stable operation id for a follow-up command of `operationId` (retrying the parent retries the same follow-up). */
export function derivedOperationId(operationId: string, purpose: string): string {
  const hex = createHash("sha256").update(`${operationId}:${purpose}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type SourcingOutcome = { warehouse_lines: number; purchase_orders: { purchase_order_id: string; number: string }[]; waiting_purchase: boolean;
  short_lines: { material_name: string; short: number | string; symbol: string }[]; replayed?: boolean };

/**
 * D19: once an order is confirmed the system sources it (stock first, the rest on a draft supplier-direct purchase order).
 * A failure here never undoes the confirmation; the order page offers "Tự phân nguồn" again.
 */
export async function autoSourceConfirmedOrder(supabase: Supabase, branchId: string, orderId: string, operationId: string,
  options: { onlyIfEnabled: boolean }): Promise<{ status: "SOURCED" | "SKIPPED" | "FAILED"; outcome?: SourcingOutcome }> {
  try {
    if (options.onlyIfEnabled) {
      const { data, error } = await supabase.from("branch_operation_settings").select("auto_source_enabled").eq("branch_id", branchId).maybeSingle();
      if (error) return { status: "FAILED" };
      if (data && data.auto_source_enabled === false) return { status: "SKIPPED" };
    }
    const { data, error } = await supabase.rpc("auto_source_sales_order", { target_sales_order_id: orderId, operation_id: operationId });
    if (error || !data) return { status: "FAILED" };
    return { status: "SOURCED", outcome: data as SourcingOutcome };
  } catch {
    return { status: "FAILED" };
  }
}

/** Where to land after confirming: tells whether sourcing went through. */
export function confirmedNotice(result: { status: "SOURCED" | "SKIPPED" | "FAILED" }) {
  return result.status === "SOURCED" ? "confirmed-sourced" : result.status === "FAILED" ? "confirmed-unsourced" : "confirmed";
}

/** One line on what sourcing did with a confirmed order (Excel import results). */
export function sourcingSummary(status: "SOURCED" | "SKIPPED" | "FAILED", outcome?: SourcingOutcome): string {
  if (status === "SKIPPED") return "Đã xác nhận (chi nhánh tắt tự phân nguồn).";
  if (status === "FAILED" || !outcome) return "Đã xác nhận; chưa tự phân nguồn được — mở đơn bấm \"Tự phân nguồn\".";
  const parts = [outcome.warehouse_lines ? `lấy từ kho ${outcome.warehouse_lines} dòng` : "",
    outcome.purchase_orders.length ? `thiếu hàng → đơn mua ${outcome.purchase_orders.map((item) => item.number).join(", ")}` : "",
    outcome.short_lines.length ? `còn thiếu ${outcome.short_lines.map((line) => `${line.short} ${line.symbol} ${line.material_name}`).join("; ")} (chưa có nhà cung cấp)` : ""].filter(Boolean);
  return `Đã xác nhận${parts.length ? ` · ${parts.join(" · ")}` : ""}.`;
}
