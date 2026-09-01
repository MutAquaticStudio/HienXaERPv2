import { randomUUID } from "node:crypto";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { FinanceWorkspace } from "@/components/finance-workspace";
import { getFinanceSnapshot } from "@/modules/finance/service";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Tài chính và dòng tiền" };

export default async function FinancePage() {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "finance.read")) return <AccessDenied />;
  const data = await getFinanceSnapshot(principal);
  const keyNames = [
    "account:create", "payment:create", "expense:create", "bank:import",
    ...data.payments.flatMap((payment) => [
      `allocate:${payment.id}`, `post:${payment.id}`, `reverse:${payment.id}`, `reconcile:${payment.id}`,
    ]),
    ...data.expenses.flatMap((expense) => [`expense-post:${expense.id}`, `expense-reverse:${expense.id}`]),
    ...data.advances.map((advance) => `advance:${advance.id}`),
  ];
  return (
    <FinanceWorkspace
      canAdjust={hasPermission(principal, "receivable.adjust") || hasPermission(principal, "payable.adjust")}
      canAllocate={hasPermission(principal, "payment.allocate")}
      canCreate={hasPermission(principal, "payment.create")}
      canManage={hasPermission(principal, "finance.manage")}
      canPost={hasPermission(principal, "payment.post")}
      canReconcile={hasPermission(principal, "reconciliation.manage")}
      canReverse={hasPermission(principal, "payment.reverse")}
      canManageExpense={hasPermission(principal, "expense.manage")}
      data={data}
      initialKeys={Object.fromEntries(keyNames.map((name) => [name, randomUUID()]))}
    />
  );
}
