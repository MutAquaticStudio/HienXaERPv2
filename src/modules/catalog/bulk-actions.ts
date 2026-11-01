"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalPermission } from "@/lib/access/context";
import { toCsv } from "@/lib/core/csv";
import { formatBusinessDate } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { portalRpc, PortalRpcError } from "@/modules/portal/server";
import { BULK_LIMIT, BULK_REASON, bulkFields, bulkKinds, bulkSummary, type BulkFailure, type BulkKind, type BulkOperation, type BulkOutcome } from "./bulk";
import { masterCommand } from "./command";
import { loadCatalogOptions } from "./editor-data";
import { branchScopedCatalogs, catalogs } from "./fields";

const PATHS = ["/admin/customers", "/admin/products", "/admin/products/pricing", "/admin/suppliers", "/admin/orders/new", "/admin/purchase-orders/new"];
const input = z.object({
  kind: z.enum(bulkKinds),
  ids: z.array(z.guid()).min(1).max(BULK_LIMIT),
  operation: z.discriminatedUnion("type", [
    z.object({ type: z.literal("set"), field: z.string(), value: z.union([z.string(), z.boolean(), z.null()]) }),
    z.object({ type: z.literal("active"), active: z.boolean() }),
    z.object({ type: z.literal("delete") }),
  ]),
});
type Row = Record<string, unknown> & { id: string; code: string };
type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
type Access = Awaited<ReturnType<typeof requireInternalPermission>>;

function failed(message: string): BulkOutcome { return { status: "FAILED", message, changed: 0, unchanged: 0, failed: [] }; }

/** Reason shown for one record the command refused or could not confirm. */
function reasonOf(error: unknown): string {
  const code = error instanceof PortalRpcError ? error.code ?? "" : "";
  const raw = error instanceof PortalRpcError ? error.rawMessage : error instanceof Error ? error.message : "";
  if (raw.includes("catalog_record_in_use")) return "đã có chứng từ hoặc dữ liệu liên quan — hãy ngừng thay vì xóa";
  if (code === "PT409" || code === "40001") return "vừa bị người khác sửa — tải lại rồi thử lại";
  if (code === "42501") return "không có quyền thay đổi bản ghi này";
  if (code === "23505") return "trùng dữ liệu với bản ghi khác";
  if (code === "22023" || code === "23514") return "giá trị không hợp lệ cho bản ghi này";
  return "chưa rõ kết quả — tải lại trang để kiểm tra";
}

/** Normalises and checks the new value against the list's own choices (active options only). */
async function checkedValue(kind: BulkKind, field: string, value: string | boolean | null, access: Access, supabase: Supabase): Promise<{ value: string | boolean | null } | { error: string }> {
  const rule = bulkFields[kind][field];
  if (rule.control === "boolean") return typeof value === "boolean" ? { value } : { error: "Chọn Có hoặc Không." };
  if (rule.control === "days") {
    const days = typeof value === "string" ? value.trim() : "";
    return /^\d{1,3}$/.test(days) && Number(days) <= 365 ? { value: String(Number(days)) } : { error: "Hạn thanh toán phải từ 0 đến 365 ngày." };
  }
  const chosen = typeof value === "string" && value.trim() ? value.trim() : null;
  if (!chosen) return rule.required ? { error: `Chọn ${rule.label.toLowerCase()}.` } : { value: null };
  const optionKind = catalogs[kind].fields.find((item) => item.key === field)?.options;
  const options = optionKind ? (await loadCatalogOptions(kind, access, supabase))[optionKind] ?? [] : [];
  return options.some((option) => option.id === chosen && option.assignable !== false) ? { value: chosen } : { error: "Lựa chọn không còn hiệu lực. Tải lại trang rồi chọn lại." };
}

/** Applies one change to every selected record through that record's own audited command, and reports each result. */
export async function bulkCatalogAction(raw: z.input<typeof input>): Promise<BulkOutcome> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return failed(`Chọn từ 1 đến ${BULK_LIMIT} dòng rồi thử lại.`);
  const { kind, operation } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];
  const config = catalogs[kind];
  const access = await requireInternalPermission(config.permission);
  if (operation.type === "set") {
    const rule = bulkFields[kind][operation.field];
    if (!rule) return failed("Không sửa hàng loạt được trường này.");
    if (rule.permission && !access.permissions.has(rule.permission)) return failed(`Bạn không có quyền đổi ${rule.label.toLowerCase()}.`);
  }
  const supabase = await createServerSupabase();
  let value: string | boolean | null = null;
  if (operation.type === "set") {
    const checked = await checkedValue(kind, operation.field, operation.value, access, supabase);
    if ("error" in checked) return failed(checked.error);
    value = checked.value;
  }
  const columns = operation.type === "set" ? (kind === "materials" && bulkFields.materials[operation.field]?.control === "boolean" ? "sale_enabled,purchase_enabled" : operation.field) : "active";
  let request = supabase.from(config.table as "materials").select(`id,code,${columns}`).in("id", ids);
  if (branchScopedCatalogs.includes(kind)) request = request.eq("branch_id", access.branchId);
  const { data, error } = await request.limit(BULK_LIMIT);
  if (error) return failed("Không tải được các dòng đã chọn. Thử lại.");
  const rows = new Map((data as unknown as Row[]).map((row) => [row.id, row]));
  const failures: BulkFailure[] = ids.filter((id) => !rows.has(id)).map(() => ({ code: "—", reason: "không còn tồn tại hoặc ngoài chi nhánh" }));
  let changed = 0;
  let unchanged = 0;
  for (const row of rows.values()) {
    try {
      if (operation.type === "delete") {
        await portalRpc(supabase, "delete_catalog_record", { kind, target_id: row.id, target_branch_id: access.branchId, change_reason: BULK_REASON, operation_id: randomUUID() });
        changed += 1;
        continue;
      }
      const field = operation.type === "set" ? operation.field : "active";
      const next = operation.type === "set" ? value : operation.active;
      const current = row[field] ?? null;
      if (String(current) === String(next)) { unchanged += 1; continue; }
      if (kind === "materials" && next === false && (field === "sale_enabled" || field === "purchase_enabled")) {
        const other = field === "sale_enabled" ? row.purchase_enabled : row.sale_enabled;
        if (!other) { failures.push({ code: row.code, reason: "vật tư phải cho phép bán hoặc mua" }); continue; }
      }
      await portalRpc(supabase, masterCommand(kind), { kind, target_id: row.id, target_branch_id: access.branchId, values_json: { [field]: next },
        expected_json: { [field]: current }, change_reason: BULK_REASON, operation_id: randomUUID() });
      changed += 1;
    } catch (cause) {
      failures.push({ code: row.code, reason: reasonOf(cause) });
    }
  }
  if (changed) for (const path of PATHS) revalidatePath(path);
  return bulkSummary(kind, operation as BulkOperation, changed, unchanged, failures);
}

const exportInput = z.object({ kind: z.enum(bulkKinds), ids: z.array(z.guid()).min(1).max(BULK_LIMIT) });
export type BulkExport = { status: "SUCCESS"; csv: string; filename: string } | { status: "FAILED"; message: string };

/** The selected records as a CSV Excel opens (UTF-8 with BOM). Credit limits and internal notes are not included. */
export async function exportCatalogCsvAction(raw: z.input<typeof exportInput>): Promise<BulkExport> {
  const parsed = exportInput.safeParse(raw);
  if (!parsed.success) return { status: "FAILED", message: `Chọn từ 1 đến ${BULK_LIMIT} dòng rồi thử lại.` };
  const { kind, ids } = parsed.data;
  const access = await requireInternalPermission(catalogs[kind].permission);
  const supabase = await createServerSupabase();
  const name = (rows: { id: string; name: string }[] | null) => new Map((rows ?? []).map((row) => [row.id, row.name]));
  const yes = (value: unknown) => value ? "Có" : "Không";
  const state = (value: unknown) => value ? "Đang dùng" : "Đã ngừng";
  const date = formatBusinessDate(new Date().toISOString()).replaceAll("/", "-");
  if (kind === "customers") {
    const [result, groups, owners] = await Promise.all([
      supabase.from("customers").select("id,code,display_name,customer_type,phone,email,address_text,tax_code,tier_code,sales_owner_employee_id,payment_terms_days,active").eq("branch_id", access.branchId).in("id", ids).order("code"),
      supabase.from("customer_price_groups").select("code,name").eq("branch_id", access.branchId),
      supabase.rpc("customer_site_sales_owner_options", { target_branch_id: access.branchId }),
    ]);
    if (result.error) return { status: "FAILED", message: "Không tải được khách hàng đã chọn." };
    const tiers = new Map(((groups.data ?? []) as { code: string; name: string }[]).map((row) => [row.code, row.name]));
    const staff = name(owners.data as { id: string; name: string }[] | null);
    const rows = (result.data as Record<string, string | number | boolean | null>[]).map((row) => ({
      code: String(row.code), name: String(row.display_name), type: row.customer_type === "INDIVIDUAL" ? "Cá nhân" : "Doanh nghiệp",
      phone: String(row.phone ?? ""), email: String(row.email ?? ""), address: String(row.address_text ?? ""), tax: String(row.tax_code ?? ""),
      tier: row.tier_code ? tiers.get(String(row.tier_code)) ?? String(row.tier_code) : "Giá chung",
      owner: row.sales_owner_employee_id ? staff.get(String(row.sales_owner_employee_id)) ?? "" : "", terms: Number(row.payment_terms_days ?? 0), state: state(row.active),
    }));
    return { status: "SUCCESS", filename: `khach-hang-${date}.csv`, csv: toCsv(rows, [["code", "Mã"], ["name", "Tên khách hàng"], ["type", "Loại khách"], ["phone", "Điện thoại"], ["email", "Thư điện tử"],
      ["address", "Địa chỉ"], ["tax", "Mã số thuế"], ["tier", "Nhóm giá"], ["owner", "NV phụ trách"], ["terms", "Hạn thanh toán (ngày)"], ["state", "Trạng thái"]]) };
  }
  if (kind === "materials") {
    const [result, groups, units] = await Promise.all([
      supabase.from("materials").select("id,code,name,group_id,base_uom_id,specification,sale_enabled,purchase_enabled,active").in("id", ids).order("code"),
      supabase.from("material_groups").select("id,name"),
      supabase.from("units_of_measure").select("id,name"),
    ]);
    if (result.error) return { status: "FAILED", message: "Không tải được vật tư đã chọn." };
    const group = name(groups.data as { id: string; name: string }[] | null);
    const unit = name(units.data as { id: string; name: string }[] | null);
    const rows = (result.data as Record<string, string | boolean | null>[]).map((row) => ({
      code: String(row.code), name: String(row.name), group: group.get(String(row.group_id)) ?? "", unit: unit.get(String(row.base_uom_id)) ?? "",
      spec: String(row.specification ?? ""), sale: yes(row.sale_enabled), purchase: yes(row.purchase_enabled), state: state(row.active),
    }));
    return { status: "SUCCESS", filename: `vat-tu-${date}.csv`, csv: toCsv(rows, [["code", "Mã"], ["name", "Tên vật tư"], ["group", "Nhóm"], ["unit", "Đơn vị cơ sở"],
      ["spec", "Quy cách"], ["sale", "Cho phép bán"], ["purchase", "Cho phép mua"], ["state", "Trạng thái"]]) };
  }
  const result = await supabase.from("suppliers").select("id,code,name,phone,email,address_text,tax_code,payment_terms_days,active").eq("branch_id", access.branchId).in("id", ids).order("code");
  if (result.error) return { status: "FAILED", message: "Không tải được nhà cung cấp đã chọn." };
  const rows = (result.data as Record<string, string | number | boolean | null>[]).map((row) => ({
    code: String(row.code), name: String(row.name), phone: String(row.phone ?? ""), email: String(row.email ?? ""), address: String(row.address_text ?? ""),
    tax: String(row.tax_code ?? ""), terms: Number(row.payment_terms_days ?? 0), state: state(row.active),
  }));
  return { status: "SUCCESS", filename: `nha-cung-cap-${date}.csv`, csv: toCsv(rows, [["code", "Mã"], ["name", "Tên nhà cung cấp"], ["phone", "Điện thoại"], ["email", "Thư điện tử"],
    ["address", "Địa chỉ"], ["tax", "Mã số thuế"], ["terms", "Hạn thanh toán (ngày)"], ["state", "Trạng thái"]]) };
}
