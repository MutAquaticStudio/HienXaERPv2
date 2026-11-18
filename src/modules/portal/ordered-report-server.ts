import { z } from "zod";

import { orderedReportSchema, type OrderedReportResult } from "@/modules/portal/ordered-report-schema";
import { PortalRpcError, portalRpc } from "@/modules/portal/server";

type Client = Parameters<typeof portalRpc>[0];

const input = z.object({ customerId: z.guid(), from: z.iso.date(), to: z.iso.date() });

/**
 * D98: "Báo cáo hàng đã đặt" of one customer for a period of business days, read through the database's own check
 * (a member of this customer, at most 92 days). A refusal is told apart from a failure; nothing here decides who may see what.
 */
export async function fetchOrderedReport(supabase: Client, request: { customerId: string; from: string; to: string }): Promise<OrderedReportResult> {
  const parsed = input.safeParse(request);
  if (!parsed.success) return { status: "period" };
  try {
    const raw = await portalRpc<unknown>(supabase, "customer_portal_ordered_report", {
      target_customer_id: parsed.data.customerId, from_day: parsed.data.from, to_day: parsed.data.to,
    });
    const report = orderedReportSchema.safeParse(raw);
    return report.success ? { status: "ok", report: report.data } : { status: "error" };
  } catch (error) {
    if (error instanceof PortalRpcError) {
      if (error.code === "42501" || error.rawMessage.includes("forbidden")) return { status: "forbidden" };
      if (error.code === "22023" || error.rawMessage.includes("invalid_report_period")) return { status: "period" };
    }
    return { status: "error" };
  }
}
