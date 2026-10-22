"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/access/context";
import { reasonOrDefault } from "@/lib/core/reason";
import { createServerSupabase } from "@/lib/supabase/server";
import { effectivePriceState } from "@/modules/pricing/effective-state";
import { readPricingClock } from "@/modules/pricing/request-clock";
import { ratioFromDirection } from "@/modules/pricing/unit-split";
import { latestDefaultRule, stockSummary, type ListPosition, type ListPriceRule } from "./material-list";

export type MaterialUnit = { conversionId: string | null; uomId: string; symbol: string; numerator: string; denominator: string; type: string; sourceNote: string | null };
export type UnitPrice = { currentVnd: string | null; target: { ruleId: string; version: number } | null };
export type MaterialUnitsData = {
  material: { id: string; code: string; name: string; baseUomId: string; baseSymbol: string };
  units: MaterialUnit[];
  prices: Record<string, UnitPrice>;
  uomOptions: { id: string; symbol: string; name: string }[];
  costPerBaseVnd: string | null;
  can: { units: boolean; prices: boolean; readPrices: boolean };
  today: string;
};
export type MaterialUnitsResult = { success: boolean; message: string; outcomeUnknown?: boolean };

const SELLING_TYPES = ["EXACT", "PACKAGING", "ESTIMATED", "MEASURED"] as const;

function businessToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Selling units, their general prices and (with cost rights) the average cost of one base unit. */
export async function loadMaterialUnitsAction(materialId: string): Promise<MaterialUnitsData | null> {
  const access = await requireInternalAccess();
  if (!access.permissions.has("catalog.read") || !z.guid().safeParse(materialId).success) return null;
  const can = {
    units: access.permissions.has("catalog.manage"), prices: access.permissions.has("pricing.manage"), readPrices: access.permissions.has("pricing.read"),
    cost: access.permissions.has("inventory.read") && access.permissions.has("inventory.cost.read"),
  };
  const supabase = await createServerSupabase();
  const materialResult = await supabase.from("materials").select("id,code,name,base_uom_id").eq("id", materialId).maybeSingle();
  if (materialResult.error) throw new Error("Không thể tải vật tư.");
  if (!materialResult.data) return null;
  const material = materialResult.data as { id: string; code: string; name: string; base_uom_id: string };
  const noRows = Promise.resolve({ data: [], error: null });
  const [unitResult, conversionResult, priceResult, stockResult, now] = await Promise.all([
    supabase.from("units_of_measure").select("id,name,symbol,active").order("name").limit(1000),
    supabase.from("material_uom_conversions").select("id,from_uom_id,numerator::text,denominator::text,conversion_type,source_note")
      .eq("material_id", materialId).eq("to_uom_id", material.base_uom_id).eq("active", true).eq("settlement_allowed", true).limit(100),
    can.readPrices ? supabase.from("pricing_rule_read").select("id,material_id,scope_type,price_uom_id,unit_price_vnd::text,version,active,effective_from,effective_to")
      .eq("branch_id", access.branchId).eq("material_id", materialId).eq("scope_type", "DEFAULT").eq("active", true).limit(200) : noRows,
    can.cost ? supabase.from("warehouse_inventory_read").select("material_id,warehouse_id,on_hand_base_quantity::text,available_base_quantity::text,inventory_value_vnd::text")
      .eq("branch_id", access.branchId).eq("material_id", materialId).limit(200) : noRows,
    readPricingClock(),
  ]);
  if ([unitResult, conversionResult, priceResult, stockResult].some((result) => result.error)) throw new Error("Không thể tải đơn vị tính của vật tư.");
  const allUnits = (unitResult.data ?? []) as { id: string; name: string; symbol: string; active: boolean }[];
  const symbol = (id: string) => allUnits.find((unit) => unit.id === id)?.symbol ?? "Đơn vị";
  const conversions = (conversionResult.data ?? []) as unknown as { id: string; from_uom_id: string; numerator: string; denominator: string; conversion_type: string; source_note: string | null }[];
  const rules = (priceResult.data ?? []) as unknown as ListPriceRule[];
  const units: MaterialUnit[] = [
    { conversionId: null, uomId: material.base_uom_id, symbol: symbol(material.base_uom_id), numerator: "1", denominator: "1", type: "BASE", sourceNote: null },
    ...conversions.map((row) => ({ conversionId: row.id, uomId: row.from_uom_id, symbol: symbol(row.from_uom_id), numerator: row.numerator, denominator: row.denominator, type: row.conversion_type, sourceNote: row.source_note })),
  ];
  const prices: Record<string, UnitPrice> = {};
  for (const unit of units) {
    const current = rules.filter((rule) => rule.price_uom_id === unit.uomId && effectivePriceState(rule, now) === "ACTIVE").sort((left, right) => right.version - left.version)[0];
    const latest = latestDefaultRule(rules, material.id, unit.uomId);
    prices[unit.uomId] = { currentVnd: current ? String(current.unit_price_vnd) : null, target: latest?.id ? { ruleId: latest.id, version: latest.version } : null };
  }
  const stock = can.cost ? stockSummary((stockResult.data ?? []) as unknown as ListPosition[], material.id) : null;
  return {
    material: { id: material.id, code: material.code, name: material.name, baseUomId: material.base_uom_id, baseSymbol: symbol(material.base_uom_id) },
    units, prices, costPerBaseVnd: stock?.averageCostVnd ?? null,
    uomOptions: allUnits.filter((unit) => unit.active).map((unit) => ({ id: unit.id, symbol: unit.symbol, name: unit.name })),
    can: { units: can.units, prices: can.prices, readPrices: can.readPrices }, today: businessToday(),
  };
}

const inputSchema = z.object({
  operationId: z.guid(),
  materialId: z.guid(),
  reason: z.string().trim().max(500).optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  addUnits: z.array(z.object({
    uomId: z.guid(), ratio: z.string().regex(/^\d{1,13}(\.\d{1,6})?$/).refine((value) => Number(value) > 0),
    // "1 bao = 50 kg" (UNIT_TO_BASE) or "1 tấn = 20 bao" (BASE_TO_UNIT, Owner 18/10); stored as 1 unit = numerator/denominator base.
    direction: z.enum(["UNIT_TO_BASE", "BASE_TO_UNIT"]).default("UNIT_TO_BASE"),
    type: z.enum(SELLING_TYPES), sourceNote: z.string().trim().max(500),
  }).refine((unit) => !["ESTIMATED", "MEASURED"].includes(unit.type) || unit.sourceNote.length >= 3)
    .refine((unit) => ratioFromDirection(unit.ratio, unit.direction) !== null)).max(20),
  stopConversionIds: z.array(z.guid()).max(20),
  prices: z.array(z.object({
    uomId: z.guid(), priceVnd: z.string().regex(/^[1-9]\d{0,18}$/), supersedesId: z.guid().optional(), expectedVersion: z.number().int().positive().optional(),
  }).refine((item) => Boolean(item.supersedesId) === Boolean(item.expectedVersion) && BigInt(item.priceVnd) <= 9223372036854775807n)).max(21),
}).refine((input) => input.addUnits.length + input.stopConversionIds.length + input.prices.length > 0);

function unitsError(message: string, code?: string): string {
  if (code === "42501" || message.includes("forbidden")) return "Bạn không có quyền đổi đơn vị tính hoặc giá ở chi nhánh này. Chưa có thay đổi nào được lưu.";
  if (message.includes("operation_payload_conflict")) return "Lần lưu trước chưa rõ kết quả và nội dung đã thay đổi. Tải lại đơn vị tính rồi nhập lại.";
  if (message.includes("unit_already_exists")) return "Đơn vị này đã có. Muốn đổi tỉ lệ: bấm “Ngừng” ở dòng cũ rồi thêm lại với tỉ lệ mới.";
  if (message.includes("unit_source_note_required")) return "Đơn vị ước lượng hoặc đo thực tế cần ghi nguồn (3–500 ký tự), vd “xe bé ≈ 3 m³ theo thỏa thuận”.";
  if (message.includes("quantity_precision_exceeds_six") || message.includes("quantity_invalid")) return "Tỉ lệ quy đổi phải lớn hơn 0 và tối đa 6 chữ số thập phân.";
  if (message.includes("unit_inactive")) return "Đơn vị tính đã ngừng dùng. Chọn đơn vị khác.";
  if (message.includes("price_unit_not_sellable")) return "Chỉ đặt giá cho đơn vị cơ sở hoặc đơn vị bán đang dùng của vật tư này.";
  if (message.includes("stale") || message.includes("newer_price_version_exists") || message.includes("active_rule_exists") || code === "PT409") return "Đơn vị hoặc giá vừa được người khác thay đổi. Tải lại; chưa có thay đổi nào được lưu.";
  if (message.includes("effective_date_before_previous")) return "Ngày áp dụng phải từ ngày bắt đầu của giá hiện tại trở đi.";
  if (message.includes("invalid_unit") || message.includes("invalid_price_item")) return "Có dòng đơn vị hoặc giá chưa hợp lệ. Chưa có thay đổi nào được lưu.";
  return "Không thể lưu đơn vị tính. Chưa có thay đổi nào được lưu.";
}

/** Adds/stops selling units and saves their general prices together (save_material_units, all or nothing). */
export async function saveMaterialUnitsAction(input: unknown): Promise<MaterialUnitsResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { success: false, message: field === "addUnits" ? "Kiểm tra đơn vị mới: chọn đơn vị, số lớn hơn 0 (tối đa 6 chữ số thập phân), 1 đơn vị mới phải ra số chính xác của đơn vị cơ sở (vd 1 tấn = 20 bao được, 1 tấn = 3 bao không chia hết); đơn vị ước lượng/đo thực tế cần ghi nguồn."
      : field === "prices" ? "Giá phải là số nguyên dương (đồng)." : "Chưa có thay đổi nào để lưu." };
  }
  const data = parsed.data;
  if (data.prices.length && data.effectiveDate < businessToday()) return { success: false, message: "Ngày áp dụng giá không được trước hôm nay." };
  const access = await requireInternalAccess();
  const supabase = await createServerSupabase();
  try {
    const { error } = await supabase.rpc("save_material_units", {
      target_branch_id: access.branchId,
      target_material_id: data.materialId,
      add_units: data.addUnits.map((unit) => ({ uom_id: unit.uomId, ...ratioFromDirection(unit.ratio, unit.direction)!, conversion_type: unit.type, source_note: unit.sourceNote || null })),
      stop_conversion_ids: data.stopConversionIds,
      prices: data.prices.map((item) => ({ price_uom_id: item.uomId, unit_price_vnd: item.priceVnd,
        ...(item.supersedesId ? { supersedes_id: item.supersedesId, expected_version: item.expectedVersion } : {}) })),
      effective_from: data.prices.length ? `${data.effectiveDate}T00:00:00+07:00` : null,
      change_reason: reasonOrDefault(data.reason, "Cập nhật đơn vị tính"),
      operation_id: data.operationId,
    });
    if (error) return { success: false, message: unitsError(error.message, error.code) };
  } catch {
    return { success: false, outcomeUnknown: true, message: "Chưa xác định được kết quả lưu. Bấm lưu lại đúng thao tác này để kiểm tra; hệ thống không lưu trùng." };
  }
  for (const path of ["/admin/products", `/admin/products/${data.materialId}`, "/admin/products/pricing", "/admin/products/manage", "/admin/orders/new", "/admin/purchase-orders/new"]) revalidatePath(path);
  return { success: true, message: "Đã lưu đơn vị tính và giá. Đơn đã chốt giữ nguyên quy đổi và giá cũ." };
}
