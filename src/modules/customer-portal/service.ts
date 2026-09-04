import "server-only";

import { getDatabaseClient } from "@/lib/postgres/server";
import { createClient } from "@/lib/supabase/server";
import { canUseSyntheticAuth } from "@/modules/platform/environment";
import { PlatformError } from "@/modules/platform/errors";
import {
  SYNTHETIC_CUSTOMER_PORTAL_PRINCIPAL,
  SYNTHETIC_CUSTOMER_PORTAL_SNAPSHOT,
} from "@/modules/customer-portal/fixtures";
import {
  executeCustomerPortalCommand,
  readCustomerPortalSnapshot,
} from "@/modules/customer-portal/postgres-repository";
import type {
  CustomerPortalCommand,
  CustomerPortalPrincipal,
  CustomerPortalSnapshot,
} from "@/modules/customer-portal/types";

export type CustomerPortalAccess =
  | { kind: "unauthenticated" }
  | { kind: "not-member" }
  | { kind: "member"; principal: CustomerPortalPrincipal };

export async function getCustomerPortalAccess(): Promise<CustomerPortalAccess> {
  if (canUseSyntheticAuth()) {
    return { kind: "member", principal: SYNTHETIC_CUSTOMER_PORTAL_PRINCIPAL };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { kind: "unauthenticated" };

  const rows = await getDatabaseClient()<{
    customer_id: string;
    customer_name: string;
    portal_role: "CONTACT" | "BILLING";
  }[]>`select membership.customer_id, customer.name_vi as customer_name, membership.portal_role
    from public.customer_portal_memberships membership
    join public.customers customer on customer.id = membership.customer_id
    where membership.auth_user_id = ${data.user.id}
      and membership.active and customer.is_active
    limit 1`;
  const membership = rows[0];
  if (!membership) return { kind: "not-member" };
  return {
    kind: "member",
    principal: {
      authUserId: data.user.id,
      customerId: membership.customer_id,
      customerName: membership.customer_name,
      portalRole: membership.portal_role,
    },
  };
}

export async function getCustomerPortalSnapshot(
  principal: CustomerPortalPrincipal,
): Promise<CustomerPortalSnapshot> {
  if (canUseSyntheticAuth()) return SYNTHETIC_CUSTOMER_PORTAL_SNAPSHOT;
  return readCustomerPortalSnapshot(getDatabaseClient(), principal);
}

export async function runCustomerPortalCommand(
  principal: CustomerPortalPrincipal,
  idempotencyKey: string,
  command: CustomerPortalCommand,
) {
  if (canUseSyntheticAuth()) return { id: `synthetic-${command.kind}` };
  const rows = await getDatabaseClient().begin((sql) =>
    executeCustomerPortalCommand(sql, principal, idempotencyKey, command),
  );
  const id = rows[0]?.id;
  if (!id) {
    throw new PlatformError(
      "Hệ thống chưa ghi nhận yêu cầu. Dữ liệu nghiệp vụ cũ vẫn không thay đổi.",
      "CUSTOMER_PORTAL_COMMAND_FAILED",
      503,
    );
  }
  return { id };
}
