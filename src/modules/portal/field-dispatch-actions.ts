"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  fieldDispatchMessage,
  fieldDispatchNeedsReload,
  nextFreeAt,
  type FieldDispatchCommand,
  type FieldDispatchDeclined,
  type FieldDispatchPair,
  type FieldDispatchResult,
} from "@/modules/portal/field-dispatch";
import { authenticatedPortalClient, PortalRpcError, portalRpc } from "@/modules/portal/server";

const command = z.object({
  kind: z.enum(["DELIVERY", "SERVICE_JOB"]),
  mode: z.enum(["ASSIGN", "REASSIGN"]),
  targetId: z.guid(),
  employeeId: z.guid(),
  vehicleId: z.guid().nullish(),
  chosenStart: z.iso.datetime({ offset: true }).nullish(),
  version: z.number().int().positive(),
  operationId: z.guid(),
}).refine((value) => value.kind === "SERVICE_JOB" || Boolean(value.vehicleId));

const UNKNOWN = "Chưa giao được. Kiểm tra kết nối rồi bấm lại; hệ thống không ghi hai lần.";

/**
 * D85 "Điều phối": the lead worker gives a waiting delivery / service job to a worker, or changes the person before loading.
 * The database checks the permission, the pair, the picked time, the version and who declined; the same choice retried after
 * an unclear outcome carries the same operation id, so it is never recorded twice.
 */
export async function fieldDispatchAction(input: FieldDispatchCommand): Promise<FieldDispatchResult> {
  const parsed = command.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Chọn người (và xe với phiếu giao) rồi bấm lại." };
  const context = await authenticatedPortalClient();
  if (!context) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." };
  const { kind, mode, targetId, employeeId, vehicleId, chosenStart, version, operationId } = parsed.data;
  const name = kind === "DELIVERY"
    ? mode === "ASSIGN" ? "field_assign_delivery" : "field_reassign_delivery"
    : mode === "ASSIGN" ? "field_assign_work_item" : "field_reassign_work_item";
  const args = kind === "DELIVERY"
    ? { target_delivery_id: targetId, target_employee_id: employeeId, target_vehicle_id: vehicleId, chosen_start: chosenStart ?? null,
      expected_version: version, operation_id: operationId }
    : { target_work_item_id: targetId, target_employee_id: employeeId, chosen_start: chosenStart ?? null, expected_version: version, operation_id: operationId };
  try {
    const result = await portalRpc<{ work_item_id?: string; start_at?: string }>(context.supabase, name, args);
    revalidatePath("/work", "layout");
    return { ok: true, workItemId: result?.work_item_id, startAt: result?.start_at };
  } catch (error) {
    if (!(error instanceof PortalRpcError)) return { ok: false, unknown: true, message: UNKNOWN };
    const reload = fieldDispatchNeedsReload(error.rawMessage);
    if (reload) revalidatePath("/work", "layout");
    return { ok: false, message: fieldDispatchMessage(error.rawMessage, error.hint, new Date().toISOString()), reload,
      nextFreeAt: nextFreeAt(error.hint) };
  }
}

export type FieldDispatchOptions = { ok: true; pairs?: FieldDispatchPair[]; declined?: FieldDispatchDeclined[]; candidates?: { employee_id: string; start_at: string }[] }
  | { ok: false; message: string };

/** "Đổi người": who could take one of today's jobs instead, and when (loaded when the sheet opens). */
export async function fieldDispatchOptionsAction(kind: "DELIVERY" | "SERVICE_JOB", targetId: string): Promise<FieldDispatchOptions> {
  const parsed = z.object({ kind: z.enum(["DELIVERY", "SERVICE_JOB"]), targetId: z.guid() }).safeParse({ kind, targetId });
  if (!parsed.success) return { ok: false, message: "Không mở được việc này. Tải lại trang." };
  const context = await authenticatedPortalClient();
  if (!context) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Đăng nhập lại." };
  try {
    const options = await portalRpc<{ pairs?: FieldDispatchPair[]; declined?: FieldDispatchDeclined[]; candidates?: { employee_id: string; start_at: string }[] }>(
      context.supabase, "field_dispatch_options", { target_kind: parsed.data.kind, target_id: parsed.data.targetId });
    return { ok: true, ...options };
  } catch (error) {
    return { ok: false, message: error instanceof PortalRpcError && error.code === "42501" ? "Tài khoản này không còn quyền điều phối ở chi nhánh này."
      : "Chưa tải được danh sách thợ. Kiểm tra kết nối rồi mở lại." };
  }
}
