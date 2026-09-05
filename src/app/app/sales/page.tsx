import { parseSnapshotView } from "@/modules/platform/snapshot-view";
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { Customer360Workspace } from "@/components/customer-360-workspace";
import { getCustomer360Snapshot } from "@/modules/customer-360/service";
import type { Customer360EntityKind } from "@/modules/customer-360/types";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Khách hàng & giá bán" };

const formKinds: Customer360EntityKind[] = [
  "customer",
  "contact",
  "site",
  "price-rule",
  "credit-policy",
  "credit-override",
];

export default async function Customer360Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "customer.read")) {
    return <AccessDenied />;
  }

  const view = parseSnapshotView(await searchParams, ["profile","pricing","credit"]);
  const data = await getCustomer360Snapshot(principal, view);
  const initialKeys = Object.fromEntries(
    formKinds.map((kind) => [kind, randomUUID()]),
  ) as Record<Customer360EntityKind, string>;

  return (
    <Customer360Workspace
      key={view.tab + (view.after ?? "")}
      initialTab={view.tab as "profile" | "pricing" | "credit"}
      canManageCustomers={hasPermission(principal, "customer.manage")}
      canManageCredit={hasPermission(principal, "customer_credit.manage")}
      canManagePricing={hasPermission(principal, "pricing.manage")}
      canOverrideCredit={hasPermission(
        principal,
        "customer_credit.override",
      )}
      data={data}
      initialKeys={initialKeys}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
