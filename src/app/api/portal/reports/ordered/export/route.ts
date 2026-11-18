import { z } from "zod";

import { crossOriginRefusal } from "@/lib/core/request-origin";
import { fetchOrderedReport } from "@/modules/portal/ordered-report-server";
import { periodProblem } from "@/modules/portal/ordered-report";
import { orderedReportTable } from "@/modules/portal/ordered-report-export";
import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";
import type { CustomerPortalSnapshot } from "@/modules/portal/types";
import { attachmentHeader, EXPORT_CONTENT_TYPE, toReportCsv } from "@/modules/reports/export-table";
import { toReportXlsx } from "@/modules/reports/export-xlsx";

const noStore = { "Cache-Control": "private, no-store" };
const query = z.object({ format: z.enum(["xlsx", "csv"]).default("xlsx"), from: z.iso.date(), to: z.iso.date() });
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: noStore });

/**
 * D98: GET ?format=xlsx|csv&from=YYYY-MM-DD&to=YYYY-MM-DD → "Báo cáo hàng đã đặt" of the signed-in customer's own account as a
 * file. Same database answer as the page (membership, 92-day limit, money by role); nothing is filtered here.
 */
export async function GET(request: Request) {
  const refused = crossOriginRefusal(request);
  if (refused) return refused;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return fail("Khoảng ngày chưa đúng.", 400);
  const { format, from, to } = parsed.data;
  const problem = periodProblem(from, to);
  if (problem) return fail(problem, 400);
  const context = await authenticatedPortalClient();
  if (!context) return fail("Phiên đăng nhập đã hết hạn.", 401);
  let customer: CustomerPortalSnapshot["customer"];
  try {
    ({ customer } = await portalRpc<CustomerPortalSnapshot>(context.supabase, "customer_portal_snapshot", { target_customer_id: null }));
  } catch {
    return fail("Chưa lấy được file. Thử lại sau ít phút.", 503);
  }
  const result = await fetchOrderedReport(context.supabase, { customerId: customer.id, from, to });
  if (result.status === "forbidden") return fail("Tài khoản này chưa xem được báo cáo.", 403);
  if (result.status === "period") return fail("Chọn tối đa 92 ngày mỗi lần.", 400);
  if (result.status === "error") return fail("Chưa lấy được file. Thử lại sau ít phút.", 503);
  const table = orderedReportTable(result.report, customer.display_name);
  const body = format === "xlsx" ? new Uint8Array(await toReportXlsx(table)) : toReportCsv(table);
  return new Response(body, { headers: { "Content-Type": EXPORT_CONTENT_TYPE[format], "Content-Disposition": attachmentHeader(table.fileBase, format), ...noStore } });
}
