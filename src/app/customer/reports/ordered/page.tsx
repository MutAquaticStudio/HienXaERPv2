import { OrderedReportView } from "@/components/portal/ordered-report";
import { businessDay } from "@/lib/core/business-time";
import { getCustomerPortalSnapshot, loadOrderedReport } from "@/modules/portal/actions";
import { resolveOrderedPeriod } from "@/modules/portal/ordered-report";

/**
 * D98 "Báo cáo hàng đã đặt" (UX-CUST-010): what the customer ordered in a period, grouped by kind of goods. The period
 * lives in the address (?from=&to=, and ?day= for one day of a longer period); a wrong or missing period shows today.
 * Who sees money, and whether the customer may see the report at all, is the database's answer, not this page's.
 */
export default async function CustomerOrderedReportPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; day?: string }> }) {
  const query = await searchParams;
  const today = businessDay();
  const period = resolveOrderedPeriod(query, today);
  const { customer } = await getCustomerPortalSnapshot();
  const [result, dayResult] = await Promise.all([
    loadOrderedReport({ customerId: customer.id, from: period.from, to: period.to }),
    period.day ? loadOrderedReport({ customerId: customer.id, from: period.day, to: period.day }) : null,
  ]);
  return <OrderedReportView period={period} today={today} result={result} dayResult={dayResult} />;
}
