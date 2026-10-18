"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { parseBusinessDateTime } from "@/lib/core/business-time";
import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";
import { isExactEntryQuantity } from "@/lib/core/quantity";
import { authenticatedPortalClient } from "@/modules/portal/server";
import type { PortalCatalog } from "@/modules/portal/types";

const orderInput = z.object({
  customerId: z.guid(),
  siteId: z.guid().nullable(),
  newSite: z.object({
    name: z.string().trim().min(2).max(160), address: z.string().trim().min(5).max(300),
    receiverName: z.string().trim().max(120), receiverPhone: z.string().trim().max(60),
  }).nullable(),
  requestedAt: z.string().trim().max(40),
  note: z.string().trim().max(1000),
  lines: z.array(z.object({ materialId: z.guid(), uomId: z.guid(), quantity: z.string().trim().refine((value) => isExactEntryQuantity(value)) })).min(1).max(50),
  operationId: z.guid(),
}).refine((value) => (value.siteId === null) !== (value.newSite === null));
export type PortalOrderInput = z.input<typeof orderInput>;

/** What this customer can order, at its own prices. */
export async function getPortalCatalog(customerId?: string): Promise<PortalCatalog> {
  const context = await authenticatedPortalClient();
  if (!context) redirect("/customer/login");
  const { data, error } = await context.supabase.rpc("customer_portal_catalog", { target_customer_id: customerId ?? null, search: null, page_limit: 200 });
  if (error) {
    if (error.code === "42501") redirect("/customer?notice=order-not-allowed");
    throw new Error("Không tải được danh mục hàng. Thử lại sau.");
  }
  return data as PortalCatalog;
}

const failures: Record<string, string> = {
  portal_price_unavailable: "Có mặt hàng chưa có giá cho tài khoản của bạn. Tải lại trang để xem danh mục mới nhất.",
  invalid_commercial_line: "Có mặt hàng không còn bán theo đơn vị đã chọn. Tải lại trang rồi đặt lại.",
  invalid_or_non_settlement_conversion: "Có mặt hàng không còn bán theo đơn vị đã chọn. Tải lại trang rồi đặt lại.",
  customer_or_site_invalid: "Địa chỉ giao không còn dùng được. Chọn địa chỉ khác.",
  portal_order_invalid: "Kiểm tra lại ngày nhận (trong 120 ngày tới), địa chỉ giao và ghi chú.",
  forbidden: "Tài khoản của bạn không được đặt hàng cho khách hàng này.",
  operation_payload_conflict: "Đơn này vừa được gửi với nội dung khác. Tải lại trang trước khi gửi lại.",
};

function failure(error: { code?: string; message?: string }): CommandOutcome {
  const known = Object.entries(failures).find(([key]) => error.message?.includes(key));
  if (known) return { status: "FAILED", message: known[1] };
  if (isAuthoritativeRejection(error.code)) return { status: "FAILED", message: error.code === "42501" ? failures.forbidden : "Đơn chưa gửi được. Kiểm tra lại số lượng rồi thử lại." };
  return { status: "UNKNOWN", message: "Chưa rõ đơn đã gửi chưa. Bấm “Gửi đơn” lần nữa — hệ thống không tạo đơn trùng." };
}

/** "Gửi đơn": a DRAFT order "Chờ duyệt" priced on the server; the same operation id never creates a second order. */
export async function submitPortalOrderAction(input: PortalOrderInput): Promise<CommandOutcome> {
  const parsed = orderInput.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Kiểm tra lại: ít nhất một mặt hàng với số lượng hợp lệ và một địa chỉ giao." };
  const requestedAt = parsed.data.requestedAt ? parseBusinessDateTime(parsed.data.requestedAt) : null;
  if (parsed.data.requestedAt && !requestedAt) return { status: "FAILED", message: "Ngày giờ muốn nhận chưa đúng." };
  const context = await authenticatedPortalClient();
  if (!context) return { status: "FAILED", message: "Phiên đăng nhập đã hết. Đăng nhập lại rồi gửi đơn." };
  const site = parsed.data.newSite;
  const { data, error } = await context.supabase.rpc("submit_portal_order", {
    target_customer_id: parsed.data.customerId, target_site_id: parsed.data.siteId,
    new_site: site ? { name: site.name, address: site.address, receiver_name: site.receiverName, receiver_phone: site.receiverPhone } : null,
    requested_delivery_at: requestedAt, note: parsed.data.note || null, operation_id: parsed.data.operationId,
    order_lines: parsed.data.lines.map((line) => ({ material_id: line.materialId, ordered_uom_id: line.uomId, quantity: line.quantity })),
  });
  if (error) return failure(error);
  if (typeof data !== "string") return { status: "UNKNOWN", message: "Chưa rõ đơn đã gửi chưa. Bấm “Gửi đơn” lần nữa — hệ thống không tạo đơn trùng." };
  revalidatePath("/customer");
  revalidatePath("/customer/orders");
  return { status: "SUCCESS", message: "Đã gửi đơn. Cửa hàng sẽ duyệt và báo ngày giao.", resultId: data };
}

/** "Hủy đơn" while the order still waits for approval. */
export async function cancelPortalOrderAction(form: FormData) {
  const parsed = z.object({ orderId: z.guid(), reason: z.string().trim().min(3).max(300), operationId: z.guid() })
    .safeParse({ orderId: form.get("orderId"), reason: form.get("reason"), operationId: form.get("operationId") });
  if (!parsed.success) redirect(`/customer/orders/${String(form.get("orderId") ?? "")}?notice=cancel-reason`);
  const context = await authenticatedPortalClient();
  if (!context) redirect("/customer/login");
  const { error } = await context.supabase.rpc("cancel_portal_order", { target_order_id: parsed.data.orderId, reason: parsed.data.reason,
    operation_id: parsed.data.operationId });
  revalidatePath(`/customer/orders/${parsed.data.orderId}`);
  revalidatePath("/customer/orders");
  redirect(`/customer/orders/${parsed.data.orderId}?notice=${error ? "cancel-failed" : "cancelled"}`);
}
