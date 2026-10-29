"use server";

// FB16 (D38): "Đổi người bán" on an order — the owner only; the database checks again and keeps the history.
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { SELLER_PERMISSION, sellerError } from "./seller";

export type SellerChangeState = { success?: boolean; message?: string } | undefined;

export async function setSalesOrderSellerAction(_: SellerChangeState, form: FormData): Promise<SellerChangeState> {
  const parsed = z.object({ orderId: z.guid(), sellerEmployeeId: z.guid(), operationId: z.guid() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: "Chọn nhân viên bán hàng." };
  await requireInternalPermission(SELLER_PERMISSION);
  const { error } = await (await createServerSupabase()).rpc("set_sales_order_seller", {
    target_order_id: parsed.data.orderId, target_employee_id: parsed.data.sellerEmployeeId, operation_id: parsed.data.operationId });
  if (error) return { message: sellerError(error.message) };
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath("/admin/orders");
  return { success: true, message: "Đã đổi người bán." };
}
