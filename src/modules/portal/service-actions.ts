"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { isAuthoritativeRejection, type CommandOutcome } from "@/lib/core/command-outcome";
import { isExactEntryQuantity } from "@/lib/core/quantity";
import { reasonOrDefault } from "@/lib/core/reason";
import { authenticatedPortalClient, portalRpc, PortalRpcError } from "@/modules/portal/server";
import type { CustomerServiceRequest, CustomerServiceRequests, PortalServiceCatalog } from "@/modules/portal/service-request";

// D75: "Đặt dịch vụ" on the customer portal. The customer sends a request; the store schedules it. Reads and writes go through
// RPCs that check the portal membership (only the owner of the account orders); nothing here holds a service-role key.

const submitInput = z.object({
  customerId: z.guid(),
  siteId: z.guid().nullable(),
  newSite: z.object({ name: z.string().trim().min(2).max(160), address: z.string().trim().min(5).max(300) }).nullable(),
  serviceTypeId: z.guid(),
  quantity: z.string().trim().refine((value) => isExactEntryQuantity(value)),
  date: z.iso.date(),
  slot: z.enum(["MORNING", "AFTERNOON", "TIME"]),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  contactName: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().max(30).refine((value) => /^[0-9+().\s-]+$/.test(value) && value.replace(/\D/g, "").length >= 8 && value.replace(/\D/g, "").length <= 15),
  note: z.string().trim().max(1000),
  operationId: z.guid(),
}).refine((value) => (value.siteId === null) !== (value.newSite === null))
  .refine((value) => (value.slot === "TIME") === (value.time !== null));
export type ServiceRequestInput = z.input<typeof submitInput>;

async function clientOrLogin() {
  const context = await authenticatedPortalClient();
  if (!context) redirect("/customer/login");
  return context.supabase;
}

/** What this customer may request: only the service types the owner turned on for the portal. Only the owner of the account orders. */
export async function getPortalServiceCatalog(customerId?: string): Promise<PortalServiceCatalog> {
  const supabase = await clientOrLogin();
  try {
    return await portalRpc<PortalServiceCatalog>(supabase, "customer_portal_service_catalog", { target_customer_id: customerId ?? null });
  } catch (error) {
    if (error instanceof PortalRpcError && error.code === "42501") redirect("/customer?notice=order-not-allowed");
    throw new Error("Không tải được danh mục dịch vụ. Thử lại sau.");
  }
}

/** The customer's own requests, newest first; every role of the account may follow them. */
export async function getCustomerServiceRequests(customerId?: string): Promise<CustomerServiceRequests> {
  const supabase = await clientOrLogin();
  return portalRpc<CustomerServiceRequests>(supabase, "customer_portal_service_requests", { target_customer_id: customerId ?? null, page_limit: 100 });
}

export async function getCustomerServiceRequest(id: string): Promise<CustomerServiceRequest> {
  const supabase = await clientOrLogin();
  try {
    return await portalRpc<CustomerServiceRequest>(supabase, "customer_portal_service_request", { target_request_id: id });
  } catch (error) {
    if (error instanceof PortalRpcError && (error.code === "42501" || error.code === "22P02")) redirect("/customer/orders?kind=services&notice=request-unavailable");
    throw error;
  }
}

const SEND_AGAIN = "Chưa rõ yêu cầu đã gửi chưa. Bấm “Gửi yêu cầu” lần nữa — hệ thống không tạo yêu cầu trùng.";
const submitFailures: Record<string, string> = {
  portal_service_request_invalid: "Kiểm tra lại ngày mong muốn (trong 120 ngày tới), giờ, tên và số điện thoại người liên hệ, địa chỉ công trình.",
  service_type_unavailable: "Dịch vụ này không còn nhận đặt trên cổng. Chọn dịch vụ khác hoặc liên hệ cửa hàng.",
  customer_or_site_invalid: "Công trình không còn dùng được. Chọn công trình khác.",
  quantity_invalid_or_out_of_range: "Số lượng phải lớn hơn 0 và tối đa 6 chữ số thập phân.",
  quantity_precision_exceeds_six: "Số lượng phải lớn hơn 0 và tối đa 6 chữ số thập phân.",
  forbidden: "Tài khoản của bạn không được đặt dịch vụ. Chỉ chủ tài khoản đặt được.",
  operation_payload_conflict: "Yêu cầu này vừa được gửi với nội dung khác. Tải lại trang trước khi gửi lại.",
};

function submitFailure(error: { code?: string; message?: string }): CommandOutcome {
  const known = Object.entries(submitFailures).find(([key]) => error.message?.includes(key));
  if (known) return { status: "FAILED", message: known[1] };
  if (error.code === "42501") return { status: "FAILED", message: submitFailures.forbidden };
  if (isAuthoritativeRejection(error.code)) return { status: "FAILED", message: "Yêu cầu chưa gửi được. Kiểm tra lại thông tin rồi thử lại." };
  return { status: "UNKNOWN", message: SEND_AGAIN };
}

/** "Gửi yêu cầu": the store is told and confirms the schedule; the customer is not charged. The same operation id never creates a second request. */
export async function submitServiceRequestAction(input: ServiceRequestInput): Promise<CommandOutcome> {
  const parsed = submitInput.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Kiểm tra lại: dịch vụ, số lượng, ngày mong muốn, tên và số điện thoại người liên hệ, công trình." };
  const context = await authenticatedPortalClient();
  if (!context) return { status: "FAILED", message: "Phiên đăng nhập đã hết. Đăng nhập lại rồi gửi yêu cầu." };
  const { data, error } = await context.supabase.rpc("submit_service_request", {
    target_customer_id: parsed.data.customerId, target_site_id: parsed.data.siteId, new_site: parsed.data.newSite,
    target_service_type_id: parsed.data.serviceTypeId, requested_quantity: parsed.data.quantity, requested_date: parsed.data.date,
    requested_slot: parsed.data.slot, requested_time: parsed.data.time, contact_name: parsed.data.contactName, contact_phone: parsed.data.contactPhone,
    request_note: parsed.data.note || null, operation_id: parsed.data.operationId,
  });
  if (error) return submitFailure(error);
  if (typeof data !== "string") return { status: "UNKNOWN", message: SEND_AGAIN };
  revalidatePath("/customer");
  revalidatePath("/customer/orders");
  return { status: "SUCCESS", message: "Đã gửi yêu cầu. Cửa hàng sẽ xác nhận lịch cho bạn.", resultId: data };
}

const cancelInput = z.object({ requestId: z.guid(), reason: z.string().trim().max(300).nullish(), operationId: z.guid() });
const CANCEL_AGAIN = "Chưa rõ yêu cầu đã hủy chưa. Bấm “Hủy yêu cầu” lần nữa — hệ thống không hủy hai lần.";

/** "Hủy yêu cầu": only while the store has not scheduled it; otherwise the reason is explained and nothing changes. */
export async function cancelServiceRequestAction(input: z.input<typeof cancelInput>): Promise<CommandOutcome> {
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { status: "FAILED", message: "Lý do hủy tối đa 300 ký tự. Kiểm tra lại rồi thử lại." };
  const context = await authenticatedPortalClient();
  if (!context) return { status: "FAILED", message: "Phiên đăng nhập đã hết. Đăng nhập lại rồi hủy yêu cầu." };
  const { error } = await context.supabase.rpc("cancel_service_request", {
    target_request_id: parsed.data.requestId, reason: reasonOrDefault(parsed.data.reason, "Khách hủy yêu cầu"), operation_id: parsed.data.operationId,
  });
  revalidatePath(`/customer/services/${parsed.data.requestId}`);
  revalidatePath("/customer/orders");
  revalidatePath("/customer");
  if (!error) return { status: "SUCCESS", message: "Đã hủy yêu cầu.", resultId: parsed.data.requestId };
  if (error.message?.includes("service_request_not_cancellable")) {
    return { status: "FAILED", message: "Cửa hàng đã xếp lịch hoặc đã xử lý yêu cầu này nên không hủy trên cổng được. Nhắn tin hoặc gọi cửa hàng để đổi hoặc hủy lịch." };
  }
  if (error.code === "42501") return { status: "FAILED", message: "Chỉ chủ tài khoản mới hủy được yêu cầu." };
  if (isAuthoritativeRejection(error.code)) return { status: "FAILED", message: "Chưa hủy được yêu cầu. Tải lại trang để xem trạng thái mới." };
  return { status: "UNKNOWN", message: CANCEL_AGAIN };
}
