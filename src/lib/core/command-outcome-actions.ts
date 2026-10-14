"use server";

import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import type { CommandOutcome } from "./command-outcome";
import { sameCommandFields } from "./command-fields";
import { creditCommandNames } from "@/modules/finance/credit-command";

import { documentCommands } from "@/modules/invoicing/document-commands";

import { noticeCommands } from "@/modules/finance/notice-commands";
import { masterCommands } from "@/modules/catalog/command";

const commandSchema = z.enum(["create_sales_order_draft", "create_purchase_order_draft", "post_payment", "receive_purchase_order", "verify_supplier_fulfillment", "allocate_payment", "resolve_commission_reconciliation", "create_delivery_expense", "approve_expense", "create_warehouse_transfer", "record_warehouse_transfer_event", "create_supplier_return", "record_supplier_return_event", "approve_supplier_return_credit", "refund_supplier_credit", "offset_supplier_credit", ...noticeCommands, ...documentCommands, ...creditCommandNames, ...masterCommands]);

export async function saveCommandDraftAction(operationId: string, command: string, entries: Array<[string, string]>): Promise<CommandOutcome> {
  const parsed = z.object({ operationId: z.uuid(), command: commandSchema, entries: z.array(z.tuple([z.string().max(100), z.string().max(60000)])).max(200) }).safeParse({ operationId, command, entries });
  if (!parsed.success) return { status: "FAILED", message: "Thông tin thao tác chưa hợp lệ. Vui lòng kiểm tra lại." };
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("save_command_draft", {
    target_operation_id: parsed.data.operationId, target_command: parsed.data.command,
    target_branch_id: access.branchId, target_entries: parsed.data.entries,
  });
  if (error || !data) return { status: "UNKNOWN", message: "Chưa xác nhận được thao tác đã được giữ để phục hồi. Hãy thử lại cùng thao tác; chưa gửi lệnh ghi nghiệp vụ." };
  return { status: "SUCCESS", resultId: String(data), message: "Đã giữ dữ liệu thao tác để phục hồi." };
}

export async function getCommandDraftAction(operationId: string, command: string): Promise<Array<[string, string]> | null> {
  if (!z.uuid().safeParse(operationId).success || !commandSchema.safeParse(command).success) return null;
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("get_command_draft", {
    target_operation_id: operationId, target_command: command, target_branch_id: access.branchId,
  });
  if (error) return null;
  const parsed = z.object({ entries: z.array(z.tuple([z.string(), z.string()])) }).safeParse(data);
  return parsed.success ? parsed.data.entries : null;
}

/** A web retry may not silently replace the fields of its saved unresolved intent. */
export async function checkSavedCommandFieldsAction(form: FormData, command: string): Promise<CommandOutcome | null> {
  const operation = String(form.get("operationId") ?? "");
  const entries = await getCommandDraftAction(operation, command);
  if (!entries) return null; // Direct canonical API/legacy callers retain their existing contract.
  const submitted: Array<[string, string]> = [];
  for (const [name, value] of form) if (typeof value === "string" && !name.startsWith("$")) submitted.push([name, value]);
  if (!sameCommandFields(submitted, entries)) return {
    status: "UNKNOWN", message: "Dữ liệu của thao tác đang phục hồi đã thay đổi. Hãy tra cứu thao tác cũ; chỉ bắt đầu lần mới sau khi kết quả đã rõ.",
  };
  return null;
}

export async function lookupCommandOutcomeAction(operationId: string, command: string): Promise<CommandOutcome> {
  const parsed = z.object({ operationId: z.uuid(), command: commandSchema }).safeParse({ operationId, command });
  if (!parsed.success) return { status: "UNKNOWN", message: "Chưa thể tra cứu kết quả thao tác." };
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("lookup_command_outcome", {
    target_operation_id: parsed.data.operationId, target_command: parsed.data.command, target_branch_id: access.branchId,
  });
  const result = data as { status?: string; result_id?: string } | null;
  if (!error && result?.status === "COMMITTED" && result.result_id) return {
    status: "SUCCESS", resultId: result.result_id, message: "Thao tác này đã được ghi nhận. Không cần gửi lại hoặc tạo chứng từ lần hai.",
  };
  return { status: "UNKNOWN", message: "Chưa xác định được kết quả đã lưu. Hãy tra cứu hoặc thử lại cùng thao tác; không tạo lần mới khi chưa rõ kết quả." };
}
