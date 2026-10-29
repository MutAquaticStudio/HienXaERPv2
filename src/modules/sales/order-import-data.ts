// FB15 (D37): the database side of "Nhập đơn bán từ Excel" — the reference lists for the template, and turning the codes
// of a parsed file into customers, sites, goods and units of the branch. Prices and conversions are then checked with the
// same rules as the order screen (createCommercialLines).
import Decimal from "decimal.js";

import type { createServerSupabase } from "@/lib/supabase/server";
import { AppError } from "@/lib/core/errors";
import { createCommercialLines, type CommercialLineInput } from "./commercial-lines";
import { normalizeRef, type ImportGroup, type TemplateReference } from "./order-import";
import { matchRecord, type Match } from "./order-match";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

export type ImportOrderInput = { key: string; customerId: string; siteId: string; deliveryDate: string | null; terms: string; lines: CommercialLineInput[] };
export type ImportPreviewOrder = {
  key: string; rows: string; customerName: string; siteName: string; deliveryDate: string | null; totalVnd: string; problems: string[];
  /** How names / phone numbers typed in the file were read ("xi mang ha tien" → XM01), for the person to check. */
  notes: string[];
  /** What the person can pick on the preview when the file's text was not recognised (D37). */
  fixes: ImportFix[];
  lines: Array<{ materialName: string; unit: string; quantity: string; unitPriceVnd: string; lineTotalVnd: string; manualPrice: boolean }>;
  input: ImportOrderInput | null;
};

export type FixOption = { id: string; label: string; detail?: string };
/** `key` is what the choice is stored under (ImportOverrides), so one choice fixes every row typed the same way. */
export type ImportFix =
  | { kind: "customer"; key: string; text: string; options: FixOption[] }
  | { kind: "site"; key: string; text: string; customerId: string; options: FixOption[] }
  | { kind: "material"; key: string; text: string; row: number; options: FixOption[] }
  | { kind: "unit"; key: string; text: string; row: number; options: FixOption[] };
export type ImportOverrides = { customers: Record<string, string>; sites: Record<string, string>; materials: Record<string, string>; units: Record<string, string> };
export const NO_OVERRIDES: ImportOverrides = { customers: {}, sites: {}, materials: {}, units: {} };
export const customerKey = (text: string) => normalizeRef(text);
export const siteKey = (customerId: string, text: string) => `${customerId}|${normalizeRef(text)}`;
export const materialKey = (text: string) => normalizeRef(text);
export const unitKey = (materialId: string, text: string) => `${materialId}|${normalizeRef(text)}`;

export async function loadTemplateReference(supabase: Supabase, branchId: string): Promise<TemplateReference> {
  const [customers, materials, conversions, units] = await Promise.all([
    supabase.from("customers").select("id, code, display_name, phone, customer_sites(code, name, active)").eq("branch_id", branchId).eq("active", true).order("code").limit(2000),
    supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("sale_enabled", true).order("code").limit(3000),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id").eq("active", true).eq("settlement_allowed", true).limit(10000),
    supabase.from("units_of_measure").select("id, symbol").eq("active", true),
  ]);
  if (customers.error || materials.error || conversions.error || units.error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không tải được danh mục cho file mẫu.", status: 503 });
  const symbol = new Map((units.data ?? []).map((unit) => [unit.id as string, unit.symbol as string]));
  const extra = new Map<string, string[]>();
  for (const row of conversions.data ?? []) extra.set(row.material_id, [...(extra.get(row.material_id) ?? []), symbol.get(row.from_uom_id) ?? ""].filter(Boolean));
  return {
    customers: (customers.data ?? []).map((row) => ({ code: row.code, name: row.display_name, phone: row.phone ?? null,
      sites: ((row.customer_sites ?? []) as Array<{ code: string; name: string; active: boolean }>).filter((site) => site.active).map((site) => ({ code: site.code, name: site.name })) })),
    materials: (materials.data ?? []).map((row) => ({ code: row.code, name: row.name,
      units: [...new Set([symbol.get(row.base_uom_id) ?? "", ...(extra.get(row.id) ?? [])].filter(Boolean))] })),
  };
}

const formatDate = (date: string | null) => (date ? `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}` : null);

type Site = { id: string; code: string; name: string; active: boolean; created_at: string };
type CustomerRow = { id: string; code: string; display_name: string; phone: string | null; customer_sites: Site[] };
type MaterialRow = { id: string; code: string; name: string; base_uom_id: string };
type UnitRow = { id: string; code: string; symbol: string; name: string };

const choices = <T,>(match: Match<T>, label: (row: T) => string) => match.found !== null || !("candidates" in match) ? "" : match.candidates.length
  ? ` Có thể là: ${match.candidates.map(label).join("; ")}. Ghi rõ mã.` : "";

/** Every order of the file with its customer, site, priced lines and total — or the problems that stop it. */
export async function resolveImport(supabase: Supabase, branchId: string, groups: ImportGroup[], canManagePrice: boolean,
  overrides: ImportOverrides = NO_OVERRIDES): Promise<ImportPreviewOrder[]> {
  // The whole active list of the branch is read once, so codes, names and phone numbers are matched the same way
  // whatever their case or accents.
  const [customers, materials, units, conversions] = await Promise.all([
    supabase.from("customers").select("id, code, display_name, phone, customer_sites(id, code, name, active, created_at)").eq("branch_id", branchId).eq("active", true).limit(5000),
    supabase.from("materials").select("id, code, name, base_uom_id").eq("active", true).eq("sale_enabled", true).limit(5000),
    supabase.from("units_of_measure").select("id, code, symbol, name").eq("active", true),
    supabase.from("material_uom_conversions").select("material_id, from_uom_id").eq("active", true).eq("settlement_allowed", true).limit(10000),
  ]);
  if (customers.error || materials.error || units.error || conversions.error) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Không đọc được danh mục khách hàng, hàng hóa.", status: 503 });
  const customerRows = (customers.data ?? []) as unknown as CustomerRow[];
  const materialRows = (materials.data ?? []) as unknown as MaterialRow[];
  const unitRows = (units.data ?? []) as UnitRow[];
  const unitOf = (raw: string) => { const key = normalizeRef(raw); return unitRows.find((unit) => [unit.symbol, unit.code, unit.name].some((value) => normalizeRef(value) === key)); };
  const symbolOf = (id: string) => unitRows.find((unit) => unit.id === id)?.symbol ?? "";
  const sellUnits = new Map<string, string[]>();
  for (const row of (conversions.data ?? []) as Array<{ material_id: string; from_uom_id: string }>) sellUnits.set(row.material_id, [...(sellUnits.get(row.material_id) ?? []), row.from_uom_id]);
  const unitOptions = (material: MaterialRow): FixOption[] => [...new Set([material.base_uom_id, ...(sellUnits.get(material.id) ?? [])])]
    .flatMap((id) => { const unit = unitRows.find((item) => item.id === id); return unit ? [{ id, label: unit.symbol, detail: unit.name }] : []; });
  const customerOption = (row: CustomerRow): FixOption => ({ id: row.id, label: `${row.code} · ${row.display_name}`, detail: row.phone ?? undefined });
  const materialOption = (row: MaterialRow): FixOption => ({ id: row.id, label: `${row.code} · ${row.name}` });
  const siteOption = (row: Site): FixOption => ({ id: row.id, label: `${row.code} · ${row.name}` });
  // A choice made on the preview wins over matching the text; it is stored by the normalised text, so it fixes every row.
  const chosen = <T extends { id: string }>(rows: readonly T[], id: string | undefined): Match<T> | null => {
    const row = id ? rows.find((item) => item.id === id) : undefined;
    return row ? { found: row, how: "code" } : null;
  };
  const materialCache = new Map<string, Match<MaterialRow>>();
  const materialOf = (ref: string) => {
    const key = materialKey(ref);
    if (!materialCache.has(key)) materialCache.set(key, chosen(materialRows, overrides.materials[key]) ?? matchRecord(materialRows, ref, { code: (row) => row.code, name: (row) => row.name }));
    return materialCache.get(key)!;
  };
  const candidates = <T,>(match: Match<T>) => (match.found === null && "candidates" in match ? match.candidates : []);

  const result: ImportPreviewOrder[] = [];
  for (const group of groups) {
    const first = group.rows[0];
    const problems = [...group.problems];
    const notes: string[] = [];
    const fixes: ImportFix[] = [];
    const customerMatch = first.customerCode ? chosen(customerRows, overrides.customers[customerKey(first.customerCode)])
      ?? matchRecord(customerRows, first.customerCode, { code: (row) => row.code, name: (row) => row.display_name, phone: (row) => row.phone }) : null;
    const customer = customerMatch?.found ?? undefined;
    if (customerMatch && !customerMatch.found) {
      problems.push(`Không nhận ra khách hàng "${first.customerCode}".${choices(customerMatch, (row) => `${row.code} ${row.display_name}`)}`);
      fixes.push({ kind: "customer", key: customerKey(first.customerCode), text: first.customerCode, options: candidates(customerMatch).map(customerOption) });
    }
    if (customerMatch?.found && customerMatch.how !== "code") notes.push(`"${first.customerCode}" → khách ${customerMatch.found.code} ${customerMatch.found.display_name}`);
    const sites = (customer?.customer_sites ?? []).filter((site) => site.active).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const siteMatch = customer ? chosen(sites, overrides.sites[siteKey(customer.id, first.siteCode)])
      ?? (first.siteCode ? matchRecord(sites, first.siteCode, { code: (row) => row.code, name: (row) => row.name }) : null) : null;
    const site = siteMatch ? siteMatch.found ?? undefined : sites[0];
    if (customer && !site) fixes.push({ kind: "site", key: siteKey(customer.id, first.siteCode), text: first.siteCode, customerId: customer.id, options: sites.map(siteOption) });
    if (customer && !site) problems.push(first.siteCode ? `Khách ${customer.code} không có công trình "${first.siteCode}".${siteMatch ? choices(siteMatch, (row) => `${row.code} ${row.name}`) : ""}` : `Khách ${customer.code} chưa có công trình nào.`);
    const lines: CommercialLineInput[] = [];
    const lineRows: number[] = [];
    const shown: ImportPreviewOrder["lines"] = [];
    for (const row of group.rows) {
      if (!row.materialCode) continue;
      const materialMatch = materialOf(row.materialCode);
      const material = materialMatch.found;
      if (!material) {
        problems.push(`Dòng ${row.row}: không nhận ra hàng "${row.materialCode}" (hoặc hàng ngừng bán).${choices(materialMatch, (item) => `${item.code} ${item.name}`)}`);
        fixes.push({ kind: "material", key: materialKey(row.materialCode), text: row.materialCode, row: row.row, options: candidates(materialMatch).map(materialOption) });
        continue;
      }
      if (materialMatch.found && materialMatch.how !== "code") notes.push(`Dòng ${row.row}: "${row.materialCode}" → ${material.code} ${material.name}`);
      const pickedUnit = row.unit ? overrides.units[unitKey(material.id, row.unit)] : undefined;
      const unit = row.unit ? unitRows.find((item) => item.id === pickedUnit) ?? unitOf(row.unit) : null;
      const sellable = unit && unitOptions(material).some((option) => option.id === unit.id);
      if (row.unit && (!unit || !sellable)) {
        problems.push(unit ? `Dòng ${row.row}: ${material.code} không bán theo đơn vị "${row.unit}".` : `Dòng ${row.row}: không có đơn vị "${row.unit}".`);
        fixes.push({ kind: "unit", key: unitKey(material.id, row.unit), text: row.unit, row: row.row, options: unitOptions(material) });
        continue;
      }
      if (row.unitPrice && !canManagePrice) problems.push(`Dòng ${row.row}: bạn không có quyền nhập giá riêng; để trống ô đơn giá để lấy theo bảng giá.`);
      lineRows.push(row.row);
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
        // The price rules number lines from 1; the person needs the row of the Excel file.
        problems.push(error instanceof AppError ? error.message.replace(/^Dòng (\d+):/, (_, index: string) => `Dòng ${lineRows[Number(index) - 1] ?? index}:`)
          : "Không tính được giá cho đơn này.");
      }
    }
    result.push({
      key: group.key, rows: group.rows.length === 1 ? `Dòng ${first.row}` : `Dòng ${first.row}–${group.rows.at(-1)!.row}`,
      customerName: customer?.display_name ?? first.customerCode, siteName: site?.name ?? "—", deliveryDate: formatDate(first.deliveryDate),
      totalVnd: total.toString(), problems, notes, fixes, lines: shown,
      input: problems.length || !customer || !site ? null : { key: group.key, customerId: customer.id, siteId: site.id, deliveryDate: first.deliveryDate,
        terms: group.rows.map((row) => row.note).filter(Boolean).join("; ").slice(0, 1000), lines },
    });
  }
  return result;
}
