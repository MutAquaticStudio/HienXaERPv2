"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { earningCommandError } from "./earning-command-error";
export async function configureRecognitionAction(formData: FormData) {
  const data = z.object({ ruleId: z.guid(), recognitionKind: z.enum(["WORK_ITEM_VERIFICATION", "AR_PAYMENT_ALLOCATION"]),
    effectiveAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!data.success) redirect("/admin/compensation?error=invalid-recognition-policy");
  await requireInternalPermission("compensation.manage");
  await requireInternalPermission("compensation.approve");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("configure_compensation_recognition", { target_rule_id: data.data.ruleId,
    recognition_kind: data.data.recognitionKind, effective_at: new Date(data.data.effectiveAt + ":00+07:00").toISOString(),
    operation_id: data.data.operationId });
  if (error) redirect("/admin/compensation?error=" + encodeURIComponent(earningCommandError(error)));
  revalidatePath("/admin/compensation");
  redirect("/admin/compensation?notice=recognition-configured");
}

/** FB10 (11): "Tính lương tháng" — one approved, owed salary per worker with a "Lương tháng" rule, once per month. */
export async function postMonthlySalariesAction(formData: FormData) {
  const data = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), operationId: z.guid() }).safeParse(Object.fromEntries(formData));
  if (!data.success) redirect("/admin/compensation?error=" + encodeURIComponent("Chọn tháng cần tính lương."));
  const access = await requireInternalPermission("compensation.manage");
  await requireInternalPermission("compensation.approve");
  const supabase = await createServerSupabase();
  const { data: result, error } = await supabase.rpc("post_monthly_salaries", { target_branch_id: access.branchId, target_month: `${data.data.month}-01`, operation_id: data.data.operationId });
  if (error) redirect("/admin/compensation?error=" + encodeURIComponent(error.message.includes("salary_month_in_future") ? "Chưa đến tháng này, chưa tính lương được." : earningCommandError(error)));
  revalidatePath("/admin/compensation");
  const posted = Number((result as { posted?: number } | null)?.posted ?? 0);
  redirect(`/admin/compensation?notice=${posted > 0 ? "salary-posted" : "salary-nothing"}&count=${posted}`);
}
