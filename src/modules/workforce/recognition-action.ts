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
