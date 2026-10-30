// FB15 (D37): the assistant names things the way people do ("xi măng Hà Tiên", "anh Minh", "kho chính"); these lookups
// turn a code or a name into the one record of the branch it means, or explain why they cannot (none, or several).
import type { createServerSupabase } from "@/lib/supabase/server";

export type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
export class ResolveError extends Error {}

type Row = Record<string, unknown> & { id: string };
const clean = (value: string) => value.trim().replace(/[%_,()]/g, " ").replace(/\s+/g, " ");

/** One row by exact code (case-insensitive) or a name containing the text; several matches are listed back. */
async function one<T extends Row>(supabase: Supabase, table: string, columns: string, ref: string, what: string,
  scope: (query: ReturnType<ReturnType<Supabase["from"]>["select"]>) => ReturnType<ReturnType<Supabase["from"]>["select"]>,
  codeColumn = "code", nameColumn = "name"): Promise<T> {
  const text = clean(ref);
  if (!text) throw new ResolveError(`Thiếu ${what}.`);
  const byCode = await scope(supabase.from(table).select(columns)).ilike(codeColumn, text).limit(2);
  if (byCode.error) throw new ResolveError(`Không đọc được ${what}.`);
  if (byCode.data?.length === 1) return byCode.data[0] as unknown as T;
  const byName = await scope(supabase.from(table).select(columns)).ilike(nameColumn, `%${text}%`).limit(6);
  if (byName.error) throw new ResolveError(`Không đọc được ${what}.`);
  const rows = (byName.data ?? []) as unknown as T[];
  const exact = rows.filter((row) => String(row[nameColumn]).toLocaleLowerCase("vi-VN") === text.toLocaleLowerCase("vi-VN"));
  if (rows.length === 1 || exact.length === 1) return exact[0] ?? rows[0];
  if (!rows.length) throw new ResolveError(`Không tìm thấy ${what} "${ref}".`);
  throw new ResolveError(`Có nhiều ${what} khớp "${ref}": ${rows.map((row) => `${row[codeColumn] ?? ""} ${row[nameColumn]}`.trim()).join("; ")}. Hỏi lại người dùng chọn một.`);
}

export const findCustomer = (supabase: Supabase, branchId: string, ref: string) =>
  one<{ id: string; code: string; display_name: string; sales_owner_employee_id: string | null }>(supabase, "customers", "id, code, display_name, sales_owner_employee_id", ref, "khách hàng",
    (query) => query.eq("branch_id", branchId).eq("active", true), "code", "display_name");

export const findSupplier = (supabase: Supabase, branchId: string, ref: string) =>
  one<{ id: string; code: string; name: string }>(supabase, "suppliers", "id, code, name", ref, "nhà cung cấp", (query) => query.eq("branch_id", branchId).eq("active", true));

export const findWarehouse = (supabase: Supabase, branchId: string, ref: string) =>
  one<{ id: string; code: string; name: string }>(supabase, "warehouses", "id, code, name", ref, "kho", (query) => query.eq("branch_id", branchId).eq("active", true));

export const findMaterial = (supabase: Supabase, ref: string, use: "sale" | "purchase" | "stock") =>
  one<{ id: string; code: string; name: string; base_uom_id: string }>(supabase, "materials", "id, code, name, base_uom_id", ref, "hàng hóa",
    (query) => use === "sale" ? query.eq("active", true).eq("sale_enabled", true) : use === "purchase" ? query.eq("active", true).eq("purchase_enabled", true) : query.eq("active", true));

export const findAccount = (supabase: Supabase, branchId: string, ref: string) =>
  one<{ id: string; code: string; name: string }>(supabase, "finance_accounts", "id, code, name", ref, "quỹ / tài khoản", (query) => query.eq("branch_id", branchId).eq("active", true));

export const findEmployee = (supabase: Supabase, branchId: string, ref: string) =>
  one<{ id: string; code: string; display_name: string }>(supabase, "workforce_read", "id, code, display_name", ref, "nhân viên",
    (query) => query.eq("branch_id", branchId).eq("active", true), "code", "display_name");

/** A site of the customer by code or name, or the first one when none is named. */
export async function findSite(supabase: Supabase, customerId: string, ref: string) {
  const { data, error } = await supabase.from("customer_sites").select("id, code, name, created_at").eq("customer_id", customerId).eq("active", true).order("created_at");
  if (error) throw new ResolveError("Không đọc được công trình của khách.");
  const sites = (data ?? []) as Array<{ id: string; code: string; name: string }>;
  if (!sites.length) throw new ResolveError("Khách chưa có công trình nào; cần thêm công trình (địa chỉ giao) trước.");
  const text = clean(ref).toLocaleLowerCase("vi-VN");
  if (!text) return sites[0];
  const found = sites.filter((site) => site.code.toLocaleLowerCase("vi-VN") === text || site.name.toLocaleLowerCase("vi-VN").includes(text));
  if (found.length === 1) return found[0];
  throw new ResolveError(found.length ? `Có nhiều công trình khớp "${ref}".` : `Khách không có công trình "${ref}". Các công trình: ${sites.map((site) => site.name).join("; ")}.`);
}

/** A unit by symbol, code or name; empty = the goods' base unit. */
export async function findUnit(supabase: Supabase, ref: string, baseUomId: string) {
  const { data, error } = await supabase.from("units_of_measure").select("id, code, symbol, name").eq("active", true);
  if (error) throw new ResolveError("Không đọc được đơn vị tính.");
  const units = (data ?? []) as Array<{ id: string; code: string; symbol: string; name: string }>;
  const text = ref.trim().toLocaleLowerCase("vi-VN");
  const unit = text ? units.find((item) => [item.symbol, item.code, item.name].some((value) => value.toLocaleLowerCase("vi-VN") === text)) : units.find((item) => item.id === baseUomId);
  if (!unit) throw new ResolveError(`Không có đơn vị "${ref}".`);
  return unit;
}

/** A document of the branch by its number (DB-…, MH-…). */
export async function findDocument(supabase: Supabase, branchId: string, table: "sales_order_read" | "purchase_order_read", numberColumn: string, ref: string, what: string) {
  const text = clean(ref).toUpperCase();
  const { data, error } = await supabase.from(table).select("*").eq("branch_id", branchId).ilike(numberColumn, `%${text}`).limit(2);
  if (error) throw new ResolveError(`Không đọc được ${what}.`);
  if (data?.length !== 1) throw new ResolveError(data?.length ? `Có nhiều ${what} khớp "${ref}"; ghi đủ mã.` : `Không tìm thấy ${what} "${ref}".`);
  return data[0] as Record<string, unknown> & { id: string };
}
