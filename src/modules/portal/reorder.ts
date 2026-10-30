// FB18: "Đặt lại" — the goods of an earlier order, matched to what the customer can order today (same goods and unit in
// their price list). Goods no longer on sale are listed so the customer knows; prices are today's, never the old ones.
import type { PortalCatalog } from "./types";

type OrderLine = { material_name: string; quantity: string; uom_symbol: string };
const same = (left: string, right: string) => left.trim().toLocaleLowerCase("vi-VN") === right.trim().toLocaleLowerCase("vi-VN");

export function reorderLines(order: { lines?: OrderLine[]; site_name?: string | null }, catalog: PortalCatalog) {
  const lines: Array<{ materialId: string; uomId: string; quantity: string }> = [];
  const missing: string[] = [];
  for (const line of order.lines ?? []) {
    const item = catalog.items.find((entry) => (same(entry.name, line.material_name) || same(`${entry.code} ${entry.name}`, line.material_name)) && same(entry.uom_symbol, line.uom_symbol));
    if (item && lines.length < 50) lines.push({ materialId: item.material_id, uomId: item.uom_id, quantity: String(line.quantity) });
    else missing.push(line.material_name);
  }
  const siteId = order.site_name ? catalog.sites.find((site) => same(site.name, order.site_name!))?.id : undefined;
  return { lines, missing, siteId };
}
