import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { CustomerPortalWorkspace } from "@/components/customer-portal-workspace";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getCustomerPortalAccess, getCustomerPortalSnapshot } from "@/modules/customer-portal/service";

export const metadata: Metadata = { title: "Đơn hàng của tôi" };

export default async function CustomerOrdersPage() {
  const access = await getCustomerPortalAccess();
  if (access.kind !== "member") return <AccessDenied />;
  const data = await getCustomerPortalSnapshot(access.principal);
  const initialKeys = Object.fromEntries(data.deliveries.flatMap((delivery) => [
    [`ack:${delivery.id}`, randomUUID()], [`issue:${delivery.id}`, randomUUID()],
  ]));
  return <CustomerPortalWorkspace data={data} initialKeys={initialKeys} section="orders" supabaseConfig={getSupabasePublicConfig()} />;
}
