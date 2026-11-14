import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import { PortalServiceForm } from "@/components/portal/portal-service-form";
import { getCustomerServiceRequest, getPortalServiceCatalog } from "@/modules/portal/service-actions";
import { matchReorder } from "@/modules/portal/service-request";

/**
 * "Đặt dịch vụ" (D75). Only the owner of the account gets the catalog: the database refuses everyone else and the
 * action sends them back to the home page with an explanation. `?from=` repeats an earlier request ("Đặt lại"): the
 * service, unit and quantity come over when the service is still offered; the day and time are always chosen again.
 */
export default async function CustomerNewServicePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const catalog = await getPortalServiceCatalog((await cookies()).get("hx_customer_id")?.value);
  const from = (await searchParams).from;
  const earlier = from && /^[0-9a-f-]{36}$/i.test(from) ? await getCustomerServiceRequest(from).catch(() => null) : null;
  const matched = earlier ? matchReorder(catalog, earlier) : null;
  const initial = earlier && matched
    ? { serviceName: matched.service.name, optionId: matched.option.id, siteId: catalog.sites.find((site) => site.name === earlier.site_name)?.id, quantity: earlier.quantity }
    : undefined;
  return <PortalServiceForm catalog={catalog} operationId={randomUUID()} initial={initial} />;
}
