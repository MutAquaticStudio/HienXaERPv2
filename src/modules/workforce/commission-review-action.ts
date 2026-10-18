"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkSavedCommandFieldsAction } from "@/lib/core/command-outcome-actions";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";

export async function resolveCommissionReviewAction(form: FormData): Promise<CommandOutcome> {
 const parsed = z.object({ caseId: z.guid(), method: z.enum(["WAIVE", "RECOVER_UNPAID_COMMISSION"]),
  target: z.string(), ruleId: z.string(), reason: z.string().trim().min(3).max(500), operationId: z.guid() }).safeParse(Object.fromEntries(form));
 if (!parsed.success) return { status: "FAILED", message: "Chọn nguồn xử lý và ghi lý do quyết định." };
 const access = await requireInternalPermission("compensation.manage");
 const changed = await checkSavedCommandFieldsAction(form, "resolve_commission_reconciliation"); if (changed) return changed;
 const [earningId = "", versionText = ""] = parsed.data.target.split(":");
 const recover = parsed.data.method === "RECOVER_UNPAID_COMMISSION";
 if (recover && (!z.guid().safeParse(earningId).success || !z.guid().safeParse(parsed.data.ruleId).success || !/^[1-9]\d*$/.test(versionText)))
  return { status: "FAILED", message: "Chọn hoa hồng còn chưa trả và quy tắc điều chỉnh theo VND." };
 const db = await createServerSupabase();
 const { data: source, error: sourceError } = await db.from("commission_reconciliation_cases").select("branch_id").eq("id", parsed.data.caseId).eq("branch_id", access.branchId).maybeSingle();
 if (sourceError || !source) return { status: "FAILED", message: "Hồ sơ không thuộc chi nhánh đang chọn hoặc không còn quyền truy cập." };
 const { data, error } = await db.rpc("resolve_commission_reconciliation", { target_case_id: parsed.data.caseId, resolution_kind: parsed.data.method,
  target_unpaid_earning_id: recover ? earningId : null, target_adjustment_rule_id: recover ? parsed.data.ruleId : null,
  expected_earning_version: recover ? Number(versionText) : null, resolution_reason: parsed.data.reason, operation_id: parsed.data.operationId });
 if (error || !data) {
  const message = error?.message.includes("exceeds_unpaid") ? "Hoa hồng chưa trả không đủ để xử lý khoản cần thu hồi. Giữ hồ sơ để đối chiếu." : error?.message.includes("requires_owner") ? "Chỉ chủ doanh nghiệp được quyết định không thu hồi." : error?.message.includes("adjustment_rule_required") ? "Cần quy tắc ADJUSTMENT theo VND, hệ số 1 và nhóm chi phí vận hành phù hợp." : "Không thể xử lý hồ sơ. Kiểm tra nguồn, phiên bản, quyền và quyết định đã ghi.";
  return { status: isAuthoritativeRejection(error?.code) ? "FAILED" : "UNKNOWN", message };
 }
 revalidatePath("/admin/compensation"); revalidatePath("/admin/payables"); revalidatePath("/admin");
 return { status: "SUCCESS", resultId: String(data), message: "Đã ghi quyết định đối chiếu. Khoản thu nhập và tiền đã trả được giữ nguyên." };
}
