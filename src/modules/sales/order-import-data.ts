// FB15 (D37): the database side of "Nhập đơn bán từ Excel" — the reference lists for the template, and turning the codes
// of a parsed file into customers, sites, goods and units of the branch. Prices and conversions are then checked with the
// same rules as the order screen (createCommercialLines).
import Decimal from "decimal.js";

import type { createServerSupabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/core/errors";
import { createCommercialLines, type CommercialLineInput } from "./commercial-lines";
import type { ImportGroup, TemplateReference } from "./order-import";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

export type ImportOrderInput = { key: string; customerId: string; siteId: string; deliveryDate: string | null; terms: string; lines: CommercialLineInput[] };
export type ImportPreviewOrder = {
  key: string; rows: string; customerName: string; siteName: string; deliveryDate: string | null; totalVnd: string; problems: string[];
  lines: Array<{ materialName: string; unit: string; quantity: string; unitPriceVnd: string; lineTotalVnd: string; manualPrice: boolean }>;
  input: ImportOrderInput | null;
};

export async function loadTemplateReference(supabase: Supabase, branchId: string): Promise<TemplateReference> {
  const [customers, materials, conversions, units] = await Promise.all([
    supabase.from("customers").select("id, code, display_name, customer_sites(code, name, active)").eq("branch_id", branchId).eq("active", true).order("code").limit(2000),
    supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("sale_enabled", true).order("code").limit(3000),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id").eq("active", true).eq("settlement_allowed", true).limit(10000),
    supabase.from("units_of_measure").select("id, symbol").eq("active", true),
  ]);
  if (customers.error || materials.error || conversions.error || units.error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không tải được danh mục cho file mẫu.", status: 503 });
  const symbol = new Map((units.data ?? []).map((unit) => [unit.id as string, unit.symbol as string]));
  const extra = new Map<string, string[]>();
  for (const row of conversions.data ?? []) extra.set(row.material_id, [...(extra.get(row.material_id) ?? []), symbol.get(row.from_uom_id) ?? ""].filter(Boolean));
  return {
    customers: (customers.data ?? []).map((row) => ({ code: row.code, name: row.display_name,
      sites: ((row.customer_sites ?? []) as Array<{ code: string; name: string; active: boolean }>).filter((site) => site.active).map((site) => ({ code: site.code, name: site.name })) })),
    materials: (materials.data ?? []).map((row) => ({ code: row.code, name: row.name,
      units: [...new Set([symbol.get(row.base_uom_id) ?? "", ...(extra.get(row.id) ?? [])].filter(Boolean))] })),
  };
}

const formatDate = (date: string | null) => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : null);

/** Every order of the file with its customer, site, priced lines and total — or the problems that stop it. */
export async function resolveImport(supabase: Supabase, branchId: string, groups: ImportGroup[], canManagePrice: boolean): Promise<ImportPreviewOrder[]> {
  const customerCodes = [...new Set(groups.flatMap((group) => group.rows.map((row) => row.customerCode)).filter(Boolean))];
  const materialCodes = [...new Set(groups.flatMap((group) => group.rows.map((row) => row.materialCode)).filter(Boolean))];
  const [customers, materials, units] = await Promise.all([
    customerCodes.length ? supabase.from("customers").select("id, code, display_name, customer_sites(id, code, name, active, created_at)").eq("branch_id", branchId).eq("active", true).in("code", customerCodes)
      : Promise.resolve({ data: [], error: null }),
    materialCodes.length ? supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("sale_enabled", true).in("code", materialCodes)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("units_of_measure").select("id, code, symbol, name").eq("active", true),
  ]);
  if (customers.error || materials.error || units.error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không đọc được danh mục khách hàng, hàng hóa.", status: 503 });
  type Site = { id: string; code: string; name: string; active: boolean; created_at: string };
  const customerByCode = new Map((customers.data ?? []).map((row) => [String(row.code).toUpperCase(), row as { id: string; code: string; display_name: string; customer_sites: Site[] }]));
  const materialByCode = new Map((materials.data ?? []).map((row) => [String(row.code).toUpperCase(), row as { id: string; code: string; name: string; base_uom_id: string }]));
  const unitRows = (units.data ?? []) as Array<{ id: string; code: string; symbol: string; name: string }>;
  const unitOf = (raw: string) => { const key = raw.trim().toLocaleLowerCase("vi-VN"); return unitRows.find((unit) => [unit.symbol, unit.code, unit.name].some((value) => value.toLocaleLowerCase("vi-VN") === key)); };
  const symbolOf = (id: string) => unitRows.find((unit) => unit.id === id)?.symbol ?? "";

  const result: ImportPreviewOrder[] = [];
  for (const group of groups) {
    const first = group.rows[0];
    const problems = [...group.problems];
    const customer = customerByCode.get(first.customerCode);
    if (first.customerCode && !customer) problems.push(`Không có khách hàng mã ${first.customerCode} ở chi nhánh này.`);
    const sites = (customer?.customer_sites ?? []).filter((site) => site.active).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const site = first.siteCode ? sites.find((item) => item.code.toUpperCase() === first.siteCode) : sites[0];
    if (customer && !site) problems.push(first.siteCode ? `Khách ${customer.code} không có công trình mã ${first.siteCode}.` : `Khách ${customer.code} chưa có công trình nào.`);
    const lines: CommercialLineInput[] = [];
    const shown: ImportPreviewOrder["lines"] = [];
    for (const row of group.rows) {
      const material = materialByCode.get(row.materialCode);
      if (row.materialCode && !material) { problems.push(`Dòng ${row.row}: không có hàng mã ${row.materialCode} (hoặc hàng ngừng bán).`); continue; }
      if (!material) continue;
      const unit = row.unit ? unitOf(row.unit) : null;
      if (row.unit && !unit) { problems.push(`Dòng ${row.row}: không có đơn vị "${row.unit}".`); continue; }
      if (row.unitPrice && !canManagePrice) problems.push(`Dòng ${row.row}: bạn không có quyền nhập giá riêng; để trống ô đơn giá để lấy theo bảng giá.`);
      lines.push({ materialId: material.id, orderedUomId: unit?.id ?? material.base_uom_id, quantity: row.quantity, ...(row.unitPrice ? { manualPriceVnd: row.unitPrice } : {}) });
      shown.push({ materialName: `${material.code} · ${material.name}`, unit: unit?.symbol ?? symbolOf(material.base_uom_id), quantity: row.quantity, unitPriceVnd: "0", lineTotalVnd: "0", manualPrice: !!row.unitPrice });
    }
    let total = 0n;
    if (!problems.length && customer && site) {
      try {
        const priced = await createCommercialLines({ customerId: customer.id, siteId: site.id, lines }, branchId, canManagePrice);
        priced.forEach((line, index) => {
          const lineTotal = BigInt(new Decimal(line.quantity).mul(String(line.unit_price_vnd)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
          shown[index] = { ...shown[index], unitPriceVnd: String(line.unit_price_vnd), lineTotalVnd: lineTotal.toString() };
          total += lineTotal;
        });
      } catch (error) {
        problems.push(error instanceof AppError ? error.message : "Không tính được giá cho đơn này.");
      }
    }
    result.push({
      key: group.key, rows: group.rows.length === 1 ? `Dòng ${first.row}` : `Dòng ${first.row}–${group.rows.at(-1)!.row}`,
      customerName: customer?.display_name ?? first.customerCode, siteName: site?.name ?? "—", deliveryDate: formatDate(first.deliveryDate),
      totalVnd: total.toString(), problems, lines: shown,
      input: problems.length || !customer || !site ? null : { key: group.key, customerId: customer.id, siteId: site.id, deliveryDate: first.deliveryDate,
        terms: group.rows.map((row) => row.note).filter(Boolean).join("; ").slice(0, 1000), lines },
    });
  }
  return result;
}
