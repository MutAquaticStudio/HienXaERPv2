import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { MyEarnings } from "@/components/my-earnings";
import { getMyEarningsSnapshot } from "@/modules/compensation/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Thu nhập của tôi" };

export default async function MyEarningsPage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal || !hasPermission(principal, "earning.read_self"))
    return <AccessDenied />;
  return <MyEarnings data={await getMyEarningsSnapshot(principal)} />;
}
