import "server-only";
import type { createServerSupabase } from "@/lib/supabase/server";
import { catalogs } from "./fields";
import type { Options } from "./editor";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
type Access = { authUserId: string; branchId: string; permissions: ReadonlySet<string> };

/** Fields of a catalog the actor may see and edit. */
export function visibleCatalogFields(kind: string, permissions: ReadonlySet<string>) {
  return catalogs[kind].fields.filter((field) => !field.permission || permissions.has(field.permission));
}

/** Recovery scope of one catalog record's editor; the same record always reuses its pending operation. */
export function catalogEditorScope(access: Access, kind: string, id?: string) {
  return `${access.authUserId}:${access.branchId}:CATALOG:${kind}:${id ?? "NEW"}`;
}

/**
 * Choices for the select fields of a catalog editor (active rows only). Values already saved on `rows`
 * that are no longer active are added back, marked "(ngừng)" and not assignable.
 */
export async function loadCatalogOptions(kind: string, access: Access, supabase: Supabase, rows: Record<string, unknown>[] = []): Promise<Options> {
  const visibleFields = visibleCatalogFields(kind, access.permissions);
  const options: Options = {};
  for (const optionKind of new Set(visibleFields.flatMap((field) => field.options ? [field.options] : []))) {
    if (optionKind === "priceGroups") {
      // The stored value is the group code; a stopped group stays visible on customers that still carry it.
      const result = await supabase.from("customer_price_groups").select("code,name,active").eq("branch_id", access.branchId).order("name").limit(200);
      if (result.error) throw new Error("Không tải được nhóm giá khách.");
      options[optionKind] = ((result.data ?? []) as { code: string; name: string; active: boolean }[])
        .map((group) => ({ id: group.code, name: `${group.name}${group.active ? "" : " (ngừng)"}`, assignable: group.active }));
      continue;
    }
    if (optionKind === "salesOwners") {
      const result = await supabase.rpc("customer_site_sales_owner_options", { target_branch_id: access.branchId });
      if (result.error) throw new Error("Không tải được nhân viên phụ trách.");
      options[optionKind] = ((result.data ?? []) as { id: string; name: string; assignable: boolean }[]).map((value) => ({ id: value.id, name: value.name, assignable: value.assignable }));
      continue;
    }
    const config = catalogs[optionKind];
    const label = optionKind === "customers" ? "display_name" : "name";
    let request = supabase.from(config.table as "materials").select(`id,${label}`).eq("active", true).order(label).limit(1000);
    if (optionKind === "customers") request = request.eq("branch_id", access.branchId);
    const result = await request;
    if (result.error) throw new Error("Không tải được lựa chọn danh mục.");
    options[optionKind] = (result.data as unknown as Record<string, string>[]).map((value) => ({ id: value.id, name: value[label] }));
    const selected = new Set(visibleFields.filter((field) => field.options === optionKind).flatMap((field) => rows.map((row) => row[field.key]))
      .filter((value): value is string => typeof value === "string" && value.length > 0));
    const present = new Set(options[optionKind].map((value) => value.id));
    const missing = [...selected].filter((id) => !present.has(id));
    if (missing.length) {
      let missingRequest = supabase.from(config.table as "materials").select(`id,${label},active`).in("id", missing).limit(200);
      if (optionKind === "customers") missingRequest = missingRequest.eq("branch_id", access.branchId);
      const missingResult = await missingRequest;
      if (missingResult.error) throw new Error("Không tải được lựa chọn đã lưu.");
      options[optionKind].push(...(missingResult.data as unknown as Record<string, string | boolean>[])
        .map((value) => ({ id: String(value.id), name: `${value[label]}${value.active ? "" : " (ngừng)"}`, assignable: Boolean(value.active) })));
    }
  }
  return options;
}

/** Everything a page needs to open a catalog create popup in place. */
export async function catalogCreateProps(kind: string, access: Access, supabase: Supabase) {
  return { kind, options: await loadCatalogOptions(kind, access, supabase), permissions: [...access.permissions], scope: catalogEditorScope(access, kind) };
}

/**
 * Everything a page needs to edit one catalog record in a popup (e.g. "Sửa" on a customer or supplier page): the record
 * with the fields the actor may see (customers add their private fields through customer_private_fields), its choices
 * and the recovery scope. `null` when the record is not in the actor's branch.
 */
export async function catalogRecordProps(kind: string, id: string, access: Access, supabase: Supabase) {
  const config = catalogs[kind];
  const fields = visibleCatalogFields(kind, access.permissions).map((field) => field.key)
    .filter((key) => kind !== "customers" || !["credit_limit_vnd", "internal_note"].includes(key));
  let request = supabase.from(config.table as "materials").select(["id", ...fields].join(",")).eq("id", id);
  if (["customers", "suppliers", "warehouses", "vehicles", "machines"].includes(kind)) request = request.eq("branch_id", access.branchId);
  const { data, error } = await request.maybeSingle();
  if (error) throw new Error("Không tải được bản ghi danh mục.");
  if (!data) return null;
  let record = data as unknown as Record<string, unknown>;
  if (kind === "customers") {
    const privateResult = await supabase.rpc("customer_private_fields", { target_customer_ids: [id] }).select("customer_id,credit_limit_vnd::text,internal_note");
    if (privateResult.error) throw new Error("Không tải được thông tin riêng tư khách hàng.");
    const privateRow = (Array.isArray(privateResult.data) ? privateResult.data[0] : privateResult.data) as { credit_limit_vnd: string | null; internal_note: string | null } | null;
    if (privateRow) record = { ...record, credit_limit_vnd: privateRow.credit_limit_vnd, internal_note: privateRow.internal_note };
  }
  return { kind, record, options: await loadCatalogOptions(kind, access, supabase, [record]), permissions: [...access.permissions], scope: catalogEditorScope(access, kind, id) };
}
