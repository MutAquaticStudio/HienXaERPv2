"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc, PortalRpcError } from "@/modules/portal/server";

export type PricingState = { message: string; success?: boolean };

export async function savePricingRuleAction(_: PricingState | undefined, form: FormData): Promise<PricingState> {
  const access = await requireInternalPermission("pricing.manage");
  const mode = String(form.get("mode") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 3 || reason.length > 500) return { message: "Cần lý do thay đổi từ 3 đến 500 ký tự." };
  const supersedesId = String(form.get("supersedesId") ?? "");
  const expectedVersion = Number(form.get("expectedVersion"));
  // Retry-safe: the client keeps the same operation (and new rule) ID for a repeated submit.
  const operationId = String(form.get("operationId") ?? "");
  if (!z.uuid().safeParse(operationId).success) return { message: "Mã thao tác không hợp lệ. Hãy tải lại màn hình." };
  if (mode === "deactivate") {
    if (!z.uuid().safeParse(supersedesId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { message: "Bản giá không hợp lệ." };
    try {
      await portalRpc(await createServerSupabase(), "deactivate_pricing_rule", { target_id: supersedesId, target_branch_id: access.branchId, expected_version: expectedVersion, change_reason: reason, operation_id: operationId });
      revalidatePath("/admin/settings/pricing");
      revalidatePath("/admin/products/pricing");
      return { message: "Đã ngừng chính sách giá; chứng từ cũ giữ giá đã chốt.", success: true };
    } catch (error) { return pricingError(error); }
  }
  if (mode !== "create" && mode !== "replace") return { message: "Thao tác không hợp lệ." };
  const targetId = String(form.get("targetId") ?? "");
  if (!z.uuid().safeParse(targetId).success) return { message: "Mã thao tác không hợp lệ. Hãy tải lại màn hình." };
  if (mode === "replace" && (!z.uuid().safeParse(supersedesId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1)) return { message: "Phiên bản cần thay không hợp lệ." };
  const amount = String(form.get("unitPriceVnd") ?? "").trim();
  if (!/^[1-9]\d*$/.test(amount) || amount.length > 19 || BigInt(amount) > 9223372036854775807n) return { message: "Giá phải là số VND nguyên dương hợp lệ." };
  const sourceType = String(form.get("sourceType") ?? "");
  if (!(["LIST", "CONTRACT"] as string[]).includes(sourceType)) return { message: "Nguồn chính sách giá không hợp lệ." };
  const start = String(form.get("effectiveFrom") ?? "");
  const end = String(form.get("effectiveTo") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) || (end && end <= start)) return { message: "Ngày hiệu lực không hợp lệ." };
  const values: Record<string, string | null> = { unit_price_vnd: amount, source_type: sourceType, effective_from: `${start}T00:00:00+07:00`, effective_to: end ? `${end}T00:00:00+07:00` : null };
  if (mode === "create") {
    const scope = String(form.get("scopeType") ?? "");
    const customer = String(form.get("customerId") ?? "");
    const material = String(form.get("materialId") ?? "");
    const group = String(form.get("groupId") ?? "");
    const tier = String(form.get("tierCode") ?? "").trim();
    const uom = String(form.get("priceUomId") ?? "");
    if (!z.uuid().safeParse(uom).success) return { message: "Cần chọn đơn vị giá." };
    if (!(["CUSTOMER_MATERIAL", "CUSTOMER_GROUP", "CUSTOMER_TIER", "DEFAULT"] as string[]).includes(scope)) return { message: "Phạm vi giá không hợp lệ." };
    if (scope.startsWith("CUSTOMER_") && scope !== "CUSTOMER_TIER" && !z.uuid().safeParse(customer).success) return { message: "Cần chọn khách hàng." };
    if (scope === "CUSTOMER_GROUP" && !z.uuid().safeParse(group).success) return { message: "Cần chọn nhóm vật tư." };
    if (scope !== "CUSTOMER_GROUP" && !z.uuid().safeParse(material).success) return { message: "Cần chọn vật tư." };
    if (scope === "CUSTOMER_TIER" && (tier.length < 1 || tier.length > 40)) return { message: "Cần nhập nhóm giá khách hàng." };
    Object.assign(values, { scope_type: scope, customer_id: scope === "CUSTOMER_MATERIAL" || scope === "CUSTOMER_GROUP" ? customer : null, material_id: scope === "CUSTOMER_GROUP" ? null : material, material_group_id: scope === "CUSTOMER_GROUP" ? group : null, customer_tier_code: scope === "CUSTOMER_TIER" ? tier : null, price_uom_id: uom });
  }
  try {
    await portalRpc(await createServerSupabase(), "save_pricing_rule", { target_id: targetId, target_branch_id: access.branchId, supersedes_id: mode === "replace" ? supersedesId : null, expected_version: mode === "replace" ? expectedVersion : null, values_json: values, change_reason: reason, operation_id: operationId });
    revalidatePath("/admin/settings/pricing");
    revalidatePath("/admin/products/pricing");
    return { message: mode === "replace" ? "Đã tạo phiên bản giá mới; lịch sử giữ nguyên." : "Đã tạo chính sách giá.", success: true };
  } catch (error) { return pricingError(error); }
}

function pricingError(error: unknown): PricingState {
  const code = error instanceof PortalRpcError ? error.code : "";
  return { message: code === "PT409" || code === "23505" ? "Chính sách giá đã thay đổi hoặc trùng phạm vi. Tải lại trước khi lưu." : code === "42501" ? "Không có quyền quản lý giá ở chi nhánh này." : code === "23503" ? "Nhóm giá khách này chưa được khai báo ở chi nhánh. Tạo nhóm trong mục Nhóm giá khách trước." : "Không thể lưu chính sách giá. Kiểm tra phạm vi, đơn vị và ngày hiệu lực." };
}
