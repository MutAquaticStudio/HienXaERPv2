"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { reasonOrDefault } from "@/lib/core/reason";
import { createServerSupabase } from "@/lib/supabase/server";
import { MATERIAL_CODE_PATTERN, MAX_VARIANT_ATTRIBUTES, MAX_VARIANTS, type VariantAttributes } from "./variants";

export type VariantUnit = { uomId: string; numerator: string; denominator: string; type: "EXACT" | "PACKAGING" | "ESTIMATED" | "MEASURED"; sourceNote: string };
export type VariantMember = { id: string; code: string; name: string; attributes: VariantAttributes; active: boolean };
export type VariantGroupData = {
  group: { id: string; name: string; attributeNames: string[]; active: boolean } | null;
  members: VariantMember[];
  /** What new variants start from: the first member's base unit, group and selling units, or empty for a new group. */
  template: { groupId: string; baseUomId: string; specification: string; saleEnabled: boolean; purchaseEnabled: boolean; units: VariantUnit[] } | null;
  options: { materialGroups: { id: string; name: string }[]; uoms: { id: string; symbol: string; name: string }[]; attachable: { id: string; code: string; name: string }[] };
  can: { prices: boolean };
  today: string;
};
export type VariantGroupResult = { success: boolean; message: string; groupId?: string; outcomeUnknown?: boolean };

type GroupRow = { id: string; name: string; attribute_names: string[]; active: boolean };
type MaterialRow = { id: string; code: string; name: string; group_id: string; base_uom_id: string; specification: string | null; sale_enabled: boolean; purchase_enabled: boolean; active: boolean; variant_attributes: VariantAttributes | null };
type ConversionRow = { from_uom_id: string; numerator: string; denominator: string; conversion_type: string; source_note: string | null };

const SELLING_TYPES = ["EXACT", "PACKAGING", "ESTIMATED", "MEASURED"] as const;

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** A variant group with its members and the template for new variants; `null` id prepares a new group. */
export async function loadVariantGroupAction(groupId: string | null): Promise<VariantGroupData | null> {
  const access = await requireInternalAccess();
  if (!access.permissions.has("catalog.manage") || (groupId !== null && !z.guid().safeParse(groupId).success)) return null;
  const supabase = await createServerSupabase();
  const none = Promise.resolve({ data: [] as never[], error: null });
  const [groupResult, memberResult, materialGroupResult, uomResult, attachableResult] = await Promise.all([
    groupId ? supabase.from("material_variant_groups").select("id,name,attribute_names,active").eq("id", groupId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    groupId ? supabase.from("materials").select("id,code,name,group_id,base_uom_id,specification,sale_enabled,purchase_enabled,active,variant_attributes").eq("variant_group_id", groupId).order("name").limit(MAX_VARIANTS * 2) : none,
    supabase.from("material_groups").select("id,name").eq("active", true).order("name").limit(500),
    supabase.from("units_of_measure").select("id,symbol,name").eq("active", true).order("name").limit(1000),
    supabase.from("materials").select("id,code,name").is("variant_group_id", null).eq("active", true).order("name").limit(500),
  ]);
  if ([groupResult, memberResult, materialGroupResult, uomResult, attachableResult].some((result) => result.error)) throw new Error("Không thể tải hàng cùng loại.");
  const group = groupResult.data as GroupRow | null;
  if (groupId && !group) return null;
  const members = (memberResult.data ?? []) as MaterialRow[];
  const model = members.find((row) => row.active) ?? members[0];
  let units: VariantUnit[] = [];
  if (model) {
    const conversionResult = await supabase.from("material_uom_conversions").select("from_uom_id,numerator::text,denominator::text,conversion_type,source_note")
      .eq("material_id", model.id).eq("to_uom_id", model.base_uom_id).eq("active", true).eq("settlement_allowed", true).limit(20);
    if (conversionResult.error) throw new Error("Không thể tải đơn vị của hàng cùng loại.");
    units = ((conversionResult.data ?? []) as unknown as ConversionRow[])
      .filter((row) => (SELLING_TYPES as readonly string[]).includes(row.conversion_type))
      .map((row) => ({ uomId: row.from_uom_id, numerator: row.numerator, denominator: row.denominator, type: row.conversion_type as VariantUnit["type"], sourceNote: row.source_note ?? "" }));
  }
  return {
    group: group ? { id: group.id, name: group.name, attributeNames: group.attribute_names, active: group.active } : null,
    members: members.map((row) => ({ id: row.id, code: row.code, name: row.name, attributes: row.variant_attributes ?? {}, active: row.active })),
    template: model ? { groupId: model.group_id, baseUomId: model.base_uom_id, specification: model.specification ?? "", saleEnabled: model.sale_enabled, purchaseEnabled: model.purchase_enabled, units } : null,
    options: {
      materialGroups: (materialGroupResult.data ?? []) as { id: string; name: string }[],
      uoms: (uomResult.data ?? []) as { id: string; symbol: string; name: string }[],
      attachable: (attachableResult.data ?? []) as { id: string; code: string; name: string }[],
    },
    can: { prices: access.permissions.has("pricing.manage") },
    today: businessToday(),
  };
}

const ratio = z.string().regex(/^\d{1,13}(\.\d{1,6})?$/).refine((value) => Number(value) > 0);
const attributes = z.record(z.string().min(1).max(40), z.string().trim().min(1).max(40));
const inputSchema = z.object({
  operationId: z.guid(),
  groupId: z.guid(),
  reason: z.string().trim().max(500).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  group: z.object({ name: z.string().trim().min(2).max(160), attributeNames: z.array(z.string().trim().min(1).max(40)).min(1).max(MAX_VARIANT_ATTRIBUTES), active: z.boolean() }),
  expected: z.object({ name: z.string(), attribute_names: z.array(z.string()), active: z.boolean() }).nullable(),
  template: z.object({
    groupId: z.guid(), baseUomId: z.guid(), specification: z.string().trim().max(500), saleEnabled: z.boolean(), purchaseEnabled: z.boolean(),
    units: z.array(z.object({ uomId: z.guid(), numerator: ratio, denominator: ratio, type: z.enum(SELLING_TYPES), sourceNote: z.string().trim().max(500) })
      .refine((unit) => !["ESTIMATED", "MEASURED"].includes(unit.type) || unit.sourceNote.length >= 3)).max(20),
  }).refine((template) => template.saleEnabled || template.purchaseEnabled).nullable(),
  variants: z.array(z.union([
    z.object({ materialId: z.guid(), detach: z.literal(true) }),
    z.object({ materialId: z.guid(), attributes }),
    z.object({
      attributes, code: z.string().trim().toUpperCase().regex(MATERIAL_CODE_PATTERN), name: z.string().trim().min(2).max(160),
      prices: z.array(z.object({ uomId: z.guid(), priceVnd: z.string().regex(/^[1-9]\d{0,18}$/) })).max(21),
    }),
  ])).max(MAX_VARIANTS),
});

function variantError(message: string, code?: string): string {
  if (code === "42501" || message.includes("forbidden")) return "Bạn không có quyền sửa danh mục vật tư (hoặc đặt giá) ở chi nhánh này. Chưa có thay đổi nào được lưu.";
  if (message.includes("operation_payload_conflict")) return "Lần lưu trước chưa rõ kết quả và nội dung đã thay đổi. Đóng, mở lại rồi nhập lại.";
  if (message.includes("materials_code_key")) return "Có mã vật tư đã tồn tại. Đổi mã ở cột “Mã” rồi lưu lại.";
  if (message.includes("materials_variant_unique")) return "Có hai loại trùng thuộc tính. Mỗi loại cần giá trị thuộc tính khác nhau.";
  if (message.includes("material_in_other_group")) return "Vật tư đã thuộc hàng cùng loại khác. Bỏ nó khỏi hàng kia trước.";
  if (message.includes("material_inactive")) return "Vật tư đã ngừng dùng nên không thêm vào hàng cùng loại được.";
  if (message.includes("invalid_variant_attributes")) return "Mỗi loại cần đủ giá trị cho mọi thuộc tính (tối đa 40 ký tự).";
  if (message.includes("unit_source_note_required")) return "Đơn vị ước lượng hoặc đo thực tế cần ghi nguồn (3–500 ký tự).";
  if (message.includes("price_unit_not_sellable")) return "Chỉ đặt giá cho đơn vị cơ sở hoặc đơn vị bán của hàng này.";
  if (message.includes("stale") || message.includes("record_already_exists") || message.includes("record_missing") || code === "PT409") return "Hàng cùng loại vừa được người khác thay đổi. Đóng và mở lại; chưa có thay đổi nào được lưu.";
  return "Không thể lưu hàng cùng loại. Chưa có thay đổi nào được lưu.";
}

/** Creates or edits a product with variants in one command (save_material_variant_group, all or nothing). */
export async function saveVariantGroupAction(input: unknown): Promise<VariantGroupResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { success: false, message: field === "group" ? "Cần tên hàng (2–160 ký tự) và 1–3 thuộc tính."
      : field === "template" ? "Chọn nhóm vật tư, đơn vị cơ sở và kiểm tra các đơn vị bán (đơn vị ước lượng cần ghi nguồn)."
      : field === "variants" ? "Kiểm tra các loại: mã 2–32 ký tự (chữ không dấu, số, _ hoặc -), tên 2–160 ký tự, đủ giá trị thuộc tính, giá là số nguyên dương."
      : "Dữ liệu chưa hợp lệ." };
  }
  const data = parsed.data;
  const creates = data.variants.filter((item) => !("materialId" in item));
  if (creates.length && !data.template) return { success: false, message: "Chọn nhóm vật tư và đơn vị cơ sở cho các loại mới." };
  const hasPrices = creates.some((item) => "prices" in item && item.prices.length);
  if (hasPrices && data.effectiveDate < businessToday()) return { success: false, message: "Ngày áp dụng giá không được trước hôm nay." };
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("save_material_variant_group", {
      target_branch_id: access.branchId,
      target_group_id: data.groupId,
      group_values: { name: data.group.name, attribute_names: data.group.attributeNames, active: data.group.active },
      expected_group: data.expected,
      template: data.template ? {
        group_id: data.template.groupId, base_uom_id: data.template.baseUomId, specification: data.template.specification || null,
        sale_enabled: data.template.saleEnabled, purchase_enabled: data.template.purchaseEnabled,
        units: data.template.units.map((unit) => ({ uom_id: unit.uomId, numerator: unit.numerator, denominator: unit.denominator, conversion_type: unit.type, source_note: unit.sourceNote || null })),
      } : null,
      variants: data.variants.map((item) => "detach" in item ? { material_id: item.materialId, detach: true }
        : "materialId" in item ? { material_id: item.materialId, attributes: item.attributes }
        : { attributes: item.attributes, code: item.code, name: item.name, prices: item.prices.map((price) => ({ price_uom_id: price.uomId, unit_price_vnd: price.priceVnd })) }),
      effective_from: hasPrices ? `${data.effectiveDate}T00:00:00+07:00` : null,
      change_reason: reasonOrDefault(data.reason, "Cập nhật hàng cùng loại"),
      operation_id: data.operationId,
    });
    if (error) return { success: false, message: variantError(error.message, error.code) };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả lưu. Bấm lưu lại đúng thao tác này để kiểm tra; hệ thống không lưu trùng." };
  }
  for (const path of ["/admin/products", "/admin/products/pricing", "/admin/products/manage", "/admin/orders/new", "/admin/purchase-orders/new"]) revalidatePath(path);
  return { success: true, groupId: data.groupId, message: creates.length ? `Đã lưu hàng “${data.group.name}” và tạo ${creates.length} loại. Mỗi loại có tồn kho và giá riêng.` : `Đã lưu hàng “${data.group.name}”.` };
}
