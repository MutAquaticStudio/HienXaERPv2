"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Back to the inventory view the popup was opened from (only that page, only plain filter parameters). */
function inventoryTarget(back: FormDataEntryValue | null, outcome: string) {
  const text = typeof back === "string" && /^\/admin\/inventory(?:\?[\w=&%.-]*)?$/.test(back) ? back : "/admin/inventory";
  return `${text}${text.includes("?") ? "&" : "?"}${outcome}`;
}

export async function saveInventoryThresholdAction(formData: FormData) {
  const access = await requireInternalPermission("inventory.adjust");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const materialId = String(formData.get("materialId") ?? "");
  const threshold = String(formData.get("threshold") ?? "").trim();
  const active = String(formData.get("active") ?? "true") === "true";

  if (!UUID.test(warehouseId) || !UUID.test(materialId) || !/^\d+(?:\.\d{1,6})?$/.test(threshold)) {
    redirect(inventoryTarget(formData.get("back"), "error=threshold-invalid"));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("set_inventory_stock_threshold", {
    target_branch_id: access.branchId,
    target_warehouse_id: warehouseId,
    target_material_id: materialId,
    target_threshold_base_quantity: threshold,
    target_active: active,
  });

  if (error) redirect(inventoryTarget(formData.get("back"), "error=threshold-save-failed"));
  revalidatePath("/admin");
  revalidatePath("/admin/inventory");
  redirect(inventoryTarget(formData.get("back"), "notice=threshold-saved"));
}
