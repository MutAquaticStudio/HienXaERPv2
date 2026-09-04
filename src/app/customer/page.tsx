import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { CustomerPortalWorkspace } from "@/components/customer-portal-workspace";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getCustomerPortalAccess, getCustomerPortalSnapshot } from "@/modules/customer-portal/service";

export const metadata: Metadata = { title: "Cổng khách hàng" };

export default async function CustomerHomePage() {
  const access = await getCustomerPortalAccess();
  if (access.kind !== "member") return <AccessDenied />;
  const data = await getCustomerPortalSnapshot(access.principal);
  const initialKeys = Object.fromEntries([
    ["request", randomUUID()],
    ...data.quotes.map((quote) => [`quote:${quote.revisionId}`, randomUUID()]),
  ]);
  return <CustomerPortalWorkspace data={data} initialKeys={initialKeys} section="home" supabaseConfig={getSupabasePublicConfig()} />;
}
