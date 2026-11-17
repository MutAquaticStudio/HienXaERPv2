import type { OrderedReport } from "@/modules/portal/ordered-report-schema";

/** A "Báo cáo hàng đã đặt" as the database returns it (customer_portal_ordered_report), for tests. */
export function rawOrderedReport(options: { money?: boolean; from?: string; to?: string } = {}) {
  const money = options.money ?? true;
  const m = <T extends Record<string, string>>(fields: T) => (money ? fields : {});
  return {
    from: options.from ?? "2026-11-11", to: options.to ?? "2026-11-17", generated_at: "2026-11-17T01:46:00Z",
    role: money ? "OWNER" : "RECEIVER", show_money: money,
    order_count: 6, cancelled_count: 1, material_kinds: 3, delivered_kinds: 1,
    ...m({ total_vnd: "5260000" }),
    goods: [
      { material_id: "m1", name: "Cát đen", uom_symbol: "xe", ordered_qty: "2.000000", delivered_qty: "2.000000", remaining_qty: "0.000000", ...m({ amount_vnd: "1300000" }),
        orders: [{ order_id: "o1", order_number: "SO-2026-000414", day: "2026-11-16", quantity: "2.000000", state: "FULFILLED" }] },
      { material_id: "m2", name: "Gạch đặc", uom_symbol: "viên", ordered_qty: "1000", delivered_qty: "600", remaining_qty: "400", ...m({ amount_vnd: "1300000" }),
        orders: [
          { order_id: "o2", order_number: "SO-2026-000415", day: "2026-11-16", quantity: "600", state: "PARTIAL" },
          { order_id: "o3", order_number: "SO-2026-000419", day: "2026-11-17", quantity: "400", state: "DRAFT" },
        ] },
      { material_id: "m3", name: "Xi măng Bút Sơn PC30", uom_symbol: "bao", ordered_qty: "10", delivered_qty: "0", remaining_qty: "10", ...m({ amount_vnd: "860000" }),
        orders: [{ order_id: "o4", order_number: "SO-2026-000420", day: "2026-11-13", quantity: "10", state: "CONFIRMED" }] },
    ],
    days: [
      { day: "2026-11-17", order_count: 1, ...m({ amount_vnd: "430000" }) },
      { day: "2026-11-16", order_count: 4, ...m({ amount_vnd: "2170000" }) },
      { day: "2026-11-13", order_count: 1, ...m({ amount_vnd: "860000" }) },
    ],
    services: [{ service_job_id: "s1", name: "Máy xúc", unit_label: "ca", quantity: "1", day: "2026-11-15", ...m({ amount_vnd: "1800000" }) }],
  };
}

/** The same, parsed (what the page receives). */
export function orderedReport(options: Parameters<typeof rawOrderedReport>[0] = {}): OrderedReport {
  return rawOrderedReport(options) as unknown as OrderedReport;
}
