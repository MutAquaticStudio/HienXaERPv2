"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthoritativeRejection } from "@/lib/core/command-outcome";
import { createServerSupabase } from "@/lib/supabase/server";
import { zaloMessage } from "./presentation";

export type ZaloNotifyResult = { ok: boolean; message: string };

const notifyInput = z.object({ customerId: z.guid(), enabled: z.boolean() });

/** "Nhận thông báo Zalo" on the customer profile (staff) or the portal account page (the customer's owner / accountant). */
export async function setCustomerZaloNotifyAction(input: unknown): Promise<ZaloNotifyResult> {
  const parsed = notifyInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Không xác định được khách hàng." };
  try {
    const { error } = await (await createServerSupabase()).rpc("set_customer_zalo_notify", { target_customer_id: parsed.data.customerId, enabled: parsed.data.enabled });
    if (error) return { ok: false, message: isAuthoritativeRejection(error.code) ? zaloMessage(error.message) : "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };
    revalidatePath(`/admin/customers/${parsed.data.customerId}`);
    revalidatePath("/customer/profile");
    return { ok: true, message: parsed.data.enabled ? "Đã bật nhận thông báo qua Zalo." : "Đã tắt nhận thông báo qua Zalo." };
  } catch {
    return { ok: false, message: "Chưa xác định được kết quả. Tải lại trang để kiểm tra." };
  }
}
