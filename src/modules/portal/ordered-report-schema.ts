import { z } from "zod";

/**
 * D98: what `customer_portal_ordered_report` returns. Quantities are decimal strings and money is a whole-đồng string; the
 * database may hand a number back for either, so both are read as text and checked, never rounded. Money fields are
 * absent for a role that does not see money.
 */
const asText = z.union([z.string(), z.number()]).transform(String);
const quantity = asText.refine((value) => /^-?\d+(\.\d+)?$/.test(value));
const money = asText.refine((value) => /^-?\d+$/.test(value));
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const count = z.number().int().nonnegative();

const sourceOrder = z.object({
  order_id: z.string(),
  order_number: z.string().nullish(),
  day,
  quantity,
  state: z.string().nullish(),
});

const good = z.object({
  material_id: z.string(),
  name: z.string(),
  uom_symbol: z.string(),
  ordered_qty: quantity,
  delivered_qty: quantity,
  remaining_qty: quantity,
  amount_vnd: money.optional(),
  orders: z.array(sourceOrder),
});

export const orderedReportSchema = z.object({
  from: day,
  to: day,
  generated_at: z.string(),
  role: z.string().nullish(),
  show_money: z.boolean(),
  order_count: count,
  cancelled_count: count,
  material_kinds: count,
  delivered_kinds: count,
  total_vnd: money.optional(),
  goods: z.array(good),
  days: z.array(z.object({ day, order_count: count, amount_vnd: money.optional() })).default([]),
  services: z.array(z.object({
    service_job_id: z.string(),
    name: z.string(),
    unit_label: z.string().nullish(),
    quantity,
    day,
    amount_vnd: money.optional(),
  })).default([]),
});

export type OrderedReport = z.output<typeof orderedReportSchema>;
export type OrderedReportGood = OrderedReport["goods"][number];
export type OrderedReportSourceOrder = OrderedReportGood["orders"][number];
export type OrderedReportDay = OrderedReport["days"][number];
export type OrderedReportService = OrderedReport["services"][number];

/** The loader's answer: the report, or why there is none (plain reasons the page can word for the customer). */
export type OrderedReportResult =
  | { status: "ok"; report: OrderedReport }
  | { status: "forbidden" }
  | { status: "period" }
  | { status: "error" };
