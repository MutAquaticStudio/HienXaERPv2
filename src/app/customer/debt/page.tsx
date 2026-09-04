import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { CustomerPortalWorkspace } from "@/components/customer-portal-workspace";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getCustomerPortalAccess, getCustomerPortalSnapshot } from "@/modules/customer-portal/service";

export const metadata: Metadata = { title: "Công nợ của tôi" };

export default async function CustomerDebtPage() {
  const access = await getCustomerPortalAccess();
  if (access.kind !== "member") return <AccessDenied />;
  const data = await getCustomerPortalSnapshot(access.principal);
  return <CustomerPortalWorkspace data={data} initialKeys={{ payment: randomUUID() }} section="debt" supabaseConfig={getSupabasePublicConfig()} />;
}
