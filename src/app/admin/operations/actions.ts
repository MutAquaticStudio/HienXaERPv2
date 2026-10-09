"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireInternalAccess } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
export async function activateOperations(form: FormData) {
 const access = await requireInternalAccess();
 const version = Number(form.get("version"));
 const operationId = String(form.get("operationId") ?? randomUUID());
 const confirmation = String(form.get("confirmation") ?? "");
 if (!Number.isSafeInteger(version) || version < 0 || !/^[a-f0-9-]{36}$/i.test(operationId)) {
  redirect("/admin/operations?error=validation");
 }
 const supabase = await createServerSupabase();
 const { error } = await supabase.rpc("activate_branch_operations", {
  target_branch_id: access.branchId, expected_version: version,
  recovery_accepted: form.get("recoveryAccepted") === "on", confirmation, operation_id: operationId,
 });
 if (error) redirect("/admin/operations?error=activation-denied");
 revalidatePath("/admin", "layout");
 redirect("/admin/operations?notice=activated");
}
