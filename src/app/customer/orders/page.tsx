import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { CustomerPortalWorkspace } from "@/components/customer-portal-workspace";
import { OperationalChatPanel } from "@/components/operational-chat-panel";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { getCustomerPortalAccess, getCustomerPortalSnapshot } from "@/modules/customer-portal/service";
import { getCustomerOperationalChatSnapshot } from "@/modules/chat/service";
import type { ChatContextOption } from "@/modules/chat/types";

export const metadata: Metadata = { title: "Đơn hàng của tôi" };

export default async function CustomerOrdersPage() {
  const access = await getCustomerPortalAccess();
  if (access.kind !== "member") return <AccessDenied />;
  const [data, chat] = await Promise.all([
    getCustomerPortalSnapshot(access.principal),
    getCustomerOperationalChatSnapshot(access.principal),
  ]);
  const initialKeys = Object.fromEntries(data.deliveries.flatMap((delivery) => [
    [`ack:${delivery.id}`, randomUUID()], [`issue:${delivery.id}`, randomUUID()],
  ]));
  const chatContexts: ChatContextOption[] = [
    ...data.orders.map((order) => ({ contextType: "SALES_ORDER" as const, contextId: order.id, subject: `Đơn hàng ${order.orderNumber}`, audience: "customer" as const })),
    ...data.deliveries.map((delivery) => ({ contextType: "DELIVERY" as const, contextId: delivery.id, subject: `Chuyến giao ${delivery.deliveryNumber}`, audience: "customer" as const })),
    { contextType: "CUSTOMER_SUPPORT", contextId: access.principal.customerId, subject: "Hỗ trợ khách hàng", audience: "customer" },
  ];
  return <>
    <CustomerPortalWorkspace data={data} initialKeys={initialKeys} section="orders" supabaseConfig={getSupabasePublicConfig()} />
    <OperationalChatPanel canManage={false} contexts={chatContexts} snapshot={chat} surface="customer" supabaseConfig={getSupabasePublicConfig()} />
  </>;
}
