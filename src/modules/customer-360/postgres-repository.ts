import "server-only";

import type { Sql, TransactionSql } from "postgres";

import type { SaveCustomer360Input } from "@/modules/customer-360/commands";
import type {
  Customer360Snapshot,
  CustomerTier,
  PriceRuleScope,
} from "@/modules/customer-360/types";
import { assertPermission, hasPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";

async function assertDatabasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: Permission,
): Promise<void> {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}

export async function readCustomer360(
  sql: Sql,
  principal: Principal,
): Promise<Customer360Snapshot> {
  assertPermission(principal, "customer.read");
  await assertDatabasePermission(sql, principal.userId, "customer.read");

  const customerRows = await sql<
    {
      id: string;
      code: string;
      name: string;
      legal_name: string | null;
      tax_code: string | null;
      phone: string | null;
      email: string | null;
      tier: CustomerTier;
      is_active: boolean;
    }[]
  >`
    select id, code, name_vi as name, legal_name, tax_code, phone, email,
      tier, is_active
    from public.customers
    order by is_active desc, code
  `;
  const contactRows = await sql<
    {
      id: string;
      customer_id: string;
      name: string;
      role_name: string | null;
      phone: string | null;
      email: string | null;
      is_primary: boolean;
      is_active: boolean;
    }[]
  >`
    select id, customer_id, name, role_name, phone, email, is_primary, is_active
    from public.customer_contacts
    order by is_active desc, is_primary desc, name
  `;
  const siteRows = await sql<
    {
      id: string;
      customer_id: string;
      code: string;
      name: string;
      address: string;
      delivery_notes: string | null;
      is_default: boolean;
      is_active: boolean;
    }[]
  >`
    select id, customer_id, code, name_vi as name, address, delivery_notes,
      is_default, is_active
    from public.customer_sites
    order by is_active desc, is_default desc, code
  `;
  const materialRows = await sql<
    {
      id: string;
      code: string;
      name: string;
      group_id: string;
      group_name: string;
      sales_uom_id: string;
      sales_uom_symbol: string;
      is_active: boolean;
    }[]
  >`
    select material.id, material.code, material.name_vi as name,
      material.material_group_id as group_id,
      material_group.name_vi as group_name,
      material.sales_uom_id,
      sales_uom.symbol as sales_uom_symbol,
      material.is_active
    from public.materials as material
    join public.material_groups as material_group
      on material_group.id = material.material_group_id
    join public.uom_catalog as sales_uom on sales_uom.id = material.sales_uom_id
    order by material.is_active desc, material.code
  `;
  const materialGroupRows = await sql<
    { id: string; code: string; name: string; is_active: boolean }[]
  >`
    select id, code, name_vi as name, is_active
    from public.material_groups order by is_active desc, code
  `;
  const uomRows = await sql<
    { id: string; symbol: string; name: string; is_active: boolean }[]
  >`
    select id, symbol, name_vi as name, is_active
    from public.uom_catalog order by is_active desc, code
  `;

  let priceRuleRows: {
    id: string;
    scope: PriceRuleScope;
    customer_id: string | null;
    customer_name: string | null;
    customer_tier: CustomerTier | null;
    material_id: string | null;
    material_name: string | null;
    material_group_id: string | null;
    material_group_name: string | null;
    unit_price: string;
    currency: string;
    uom_id: string;
    uom_symbol: string;
    valid_from: string;
    valid_to: string | null;
    version: number;
    change_reason: string;
  }[] = [];
  if (hasPermission(principal, "pricing.read")) {
    await assertDatabasePermission(sql, principal.userId, "pricing.read");
    priceRuleRows = await sql<typeof priceRuleRows>`
      select rule.id, rule.scope, rule.customer_id,
        customer.name_vi as customer_name, rule.customer_tier,
        rule.material_id, material.name_vi as material_name,
        rule.material_group_id, material_group.name_vi as material_group_name,
        rule.unit_price, rule.currency, rule.uom_id, uom.symbol as uom_symbol,
        rule.valid_from::text, rule.valid_to::text, rule.version,
        rule.change_reason
      from public.customer_price_rules as rule
      left join public.customers as customer on customer.id = rule.customer_id
      left join public.materials as material on material.id = rule.material_id
      left join public.material_groups as material_group
        on material_group.id = rule.material_group_id
      join public.uom_catalog as uom on uom.id = rule.uom_id
      order by rule.valid_to is null desc, rule.valid_from desc, rule.version desc
    `;
  }

  let creditPolicyRows: {
    id: string;
    customer_id: string;
    credit_limit: string;
    allowed_overdue_days: number;
    valid_from: string;
    valid_to: string | null;
    version: number;
    change_reason: string;
  }[] = [];
  let exposureRows: {
    customer_id: string;
    receivable_amount: string;
    uninvoiced_order_amount: string;
    overdue_amount: string;
    oldest_overdue_days: number;
    customer_advance_amount: string;
    calculated_at: string;
  }[] = [];
  let financeRows: {
    customer_id: string;
    lifetime_revenue: string;
    receivable_amount: string;
    overdue_amount: string;
    customer_advance_amount: string;
    last_sale_at: string | null;
    refreshed_at: string;
  }[] = [];
  if (hasPermission(principal, "customer_credit.read")) {
    await assertDatabasePermission(sql, principal.userId, "customer_credit.read");
    creditPolicyRows = await sql<typeof creditPolicyRows>`
      select id, customer_id, credit_limit, allowed_overdue_days,
        valid_from::text, valid_to::text, version, change_reason
      from public.customer_credit_policies
      order by valid_to is null desc, valid_from desc, version desc
    `;
    exposureRows = await sql<typeof exposureRows>`
      select customer_id, receivable_amount, uninvoiced_order_amount,
        overdue_amount, oldest_overdue_days, customer_advance_amount,
        calculated_at::text
      from public.customer_credit_exposures
      order by calculated_at desc
    `;
    financeRows = await sql<typeof financeRows>`
      select customer_id, lifetime_revenue, receivable_amount, overdue_amount,
        customer_advance_amount, last_sale_at::text, refreshed_at::text
      from public.customer_finance_summaries
      order by refreshed_at desc
    `;
  }

  const timelineRows = await sql<
    {
      id: string;
      customer_id: string;
      event_type: string;
      title: string;
      detail: string | null;
      occurred_at: string;
    }[]
  >`
    select id, customer_id, event_type, title, detail, occurred_at::text
    from public.customer_timeline_events
    order by occurred_at desc
    limit 200
  `;

  return {
    customers: customerRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      legalName: row.legal_name,
      taxCode: row.tax_code,
      phone: row.phone,
      email: row.email,
      tier: row.tier,
      isActive: row.is_active,
    })),
    contacts: contactRows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name,
      role: row.role_name,
      phone: row.phone,
      email: row.email,
      isPrimary: row.is_primary,
      isActive: row.is_active,
    })),
    sites: siteRows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      code: row.code,
      name: row.name,
      address: row.address,
      deliveryNotes: row.delivery_notes,
      isDefault: row.is_default,
      isActive: row.is_active,
    })),
    materials: materialRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      groupId: row.group_id,
      groupName: row.group_name,
      salesUomId: row.sales_uom_id,
      salesUomSymbol: row.sales_uom_symbol,
      isActive: row.is_active,
    })),
    materialGroups: materialGroupRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
    })),
    uoms: uomRows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      isActive: row.is_active,
    })),
    priceRules: priceRuleRows.map((row) => ({
      id: row.id,
      scope: row.scope,
      customerId: row.customer_id,
      customerName: row.customer_name,
      customerTier: row.customer_tier,
      materialId: row.material_id,
      materialName: row.material_name,
      materialGroupId: row.material_group_id,
      materialGroupName: row.material_group_name,
      unitPrice: row.unit_price,
      currency: row.currency,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      version: row.version,
      changeReason: row.change_reason,
    })),
    creditPolicies: creditPolicyRows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      creditLimit: row.credit_limit,
      allowedOverdueDays: row.allowed_overdue_days,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      version: row.version,
      changeReason: row.change_reason,
    })),
    creditExposures: exposureRows.map((row) => ({
      customerId: row.customer_id,
      receivableAmount: row.receivable_amount,
      uninvoicedOrderAmount: row.uninvoiced_order_amount,
      overdueAmount: row.overdue_amount,
      oldestOverdueDays: row.oldest_overdue_days,
      customerAdvanceAmount: row.customer_advance_amount,
      calculatedAt: row.calculated_at,
    })),
    financeSummaries: financeRows.map((row) => ({
      customerId: row.customer_id,
      lifetimeRevenue: row.lifetime_revenue,
      receivableAmount: row.receivable_amount,
      overdueAmount: row.overdue_amount,
      customerAdvanceAmount: row.customer_advance_amount,
      lastSaleAt: row.last_sale_at,
      refreshedAt: row.refreshed_at,
    })),
    timeline: timelineRows.map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      eventType: row.event_type,
      title: row.title,
      detail: row.detail,
      occurredAt: row.occurred_at,
    })),
  };
}

async function appendTimeline(
  sql: TransactionSql,
  input: {
    customerId: string;
    eventType: string;
    title: string;
    detail?: string | null;
    actorId: string;
  },
) {
  await sql`
    insert into public.customer_timeline_events (
      customer_id, event_type, title, detail, actor_user_id
    ) values (
      ${input.customerId}, ${input.eventType}, ${input.title},
      ${input.detail ?? null}, ${input.actorId}
    )
  `;
}

function insertedId(row: { id: string } | undefined): string {
  if (!row) {
    throw new PlatformError(
      "Không nhận được mã bản ghi sau khi lưu.",
      "CUSTOMER_WRITE_FAILED",
      500,
    );
  }
  return row.id;
}

export async function saveCustomer360Record(
  sql: TransactionSql,
  actorId: string,
  input: SaveCustomer360Input,
): Promise<{ id: string; kind: SaveCustomer360Input["kind"] }> {
  switch (input.kind) {
    case "customer": {
      await assertDatabasePermission(sql, actorId, "customer.manage");
      const [row] = await sql<{ id: string }[]>`
        insert into public.customers (
          code, name_vi, legal_name, tax_code, phone, email, tier
        ) values (
          ${input.code}, ${input.name}, ${input.legalName}, ${input.taxCode},
          ${input.phone}, ${input.email}, ${input.tier}
        )
        on conflict (code) do update set
          name_vi = excluded.name_vi,
          legal_name = excluded.legal_name,
          tax_code = excluded.tax_code,
          phone = excluded.phone,
          email = excluded.email,
          tier = excluded.tier
        returning id
      `;
      const id = insertedId(row);
      await appendTimeline(sql, {
        customerId: id,
        eventType: "CUSTOMER_SAVED",
        title: "Cập nhật hồ sơ khách hàng",
        detail: `${input.code} · ${input.name}`,
        actorId,
      });
      return { id, kind: input.kind };
    }
    case "contact": {
      await assertDatabasePermission(sql, actorId, "customer.manage");
      if (input.isPrimary) {
        await sql`
          update public.customer_contacts set is_primary = false
          where customer_id = ${input.customerId} and is_primary
        `;
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.customer_contacts (
          customer_id, name, role_name, phone, email, is_primary
        ) values (
          ${input.customerId}, ${input.name}, ${input.role}, ${input.phone},
          ${input.email}, ${input.isPrimary}
        ) returning id
      `;
      const id = insertedId(row);
      await appendTimeline(sql, {
        customerId: input.customerId,
        eventType: "CONTACT_ADDED",
        title: "Thêm người liên hệ",
        detail: input.name,
        actorId,
      });
      return { id, kind: input.kind };
    }
    case "site": {
      await assertDatabasePermission(sql, actorId, "customer.manage");
      if (input.isDefault) {
        await sql`
          update public.customer_sites set is_default = false
          where customer_id = ${input.customerId} and is_default
        `;
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.customer_sites (
          customer_id, code, name_vi, address, delivery_notes, is_default
        ) values (
          ${input.customerId}, ${input.code}, ${input.name}, ${input.address},
          ${input.deliveryNotes}, ${input.isDefault}
        )
        on conflict (customer_id, code) do update set
          name_vi = excluded.name_vi,
          address = excluded.address,
          delivery_notes = excluded.delivery_notes,
          is_default = excluded.is_default
        returning id
      `;
      const id = insertedId(row);
      await appendTimeline(sql, {
        customerId: input.customerId,
        eventType: "SITE_SAVED",
        title: "Cập nhật địa điểm giao hàng",
        detail: `${input.name} · ${input.address}`,
        actorId,
      });
      return { id, kind: input.kind };
    }
    case "price-rule": {
      await assertDatabasePermission(sql, actorId, "pricing.manage");
      const existing = await sql<{ id: string; valid_from: string; version: number }[]>`
        select id, valid_from::text, version
        from public.customer_price_rules
        where scope = ${input.scope}
          and customer_id is not distinct from ${input.customerId}
          and customer_tier is not distinct from ${input.customerTier}
          and material_id is not distinct from ${input.materialId}
          and material_group_id is not distinct from ${input.materialGroupId}
          and valid_to is null
        for update
      `;
      const current = existing[0];
      if (current && current.valid_from >= input.validFrom) {
        throw new PlatformError(
          "Ngày hiệu lực mới phải sau version giá hiện hành.",
          "PRICE_EFFECTIVE_DATE_CONFLICT",
          409,
        );
      }
      if (current) {
        await sql`
          update public.customer_price_rules
          set valid_to = (${input.validFrom}::date - 1)
          where id = ${current.id}
        `;
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.customer_price_rules (
          scope, customer_id, customer_tier, material_id, material_group_id,
          unit_price, currency, uom_id, valid_from, version, change_reason,
          created_by
        ) values (
          ${input.scope}, ${input.customerId}, ${input.customerTier},
          ${input.materialId}, ${input.materialGroupId}, ${input.unitPrice},
          ${input.currency}, ${input.uomId}, ${input.validFrom},
          ${current ? current.version + 1 : 1}, ${input.changeReason}, ${actorId}
        ) returning id
      `;
      const id = insertedId(row);
      if (input.customerId) {
        await appendTimeline(sql, {
          customerId: input.customerId,
          eventType: "PRICE_RULE_CREATED",
          title: "Tạo version giá mới",
          detail: `${input.unitPrice} ${input.currency} · hiệu lực ${input.validFrom}`,
          actorId,
        });
      }
      return { id, kind: input.kind };
    }
    case "credit-policy": {
      await assertDatabasePermission(sql, actorId, "customer_credit.manage");
      const existing = await sql<{ id: string; valid_from: string; version: number }[]>`
        select id, valid_from::text, version
        from public.customer_credit_policies
        where customer_id = ${input.customerId} and valid_to is null
        for update
      `;
      const current = existing[0];
      if (current && current.valid_from >= input.validFrom) {
        throw new PlatformError(
          "Ngày hiệu lực mới phải sau chính sách hiện hành.",
          "CREDIT_POLICY_DATE_CONFLICT",
          409,
        );
      }
      if (current) {
        await sql`
          update public.customer_credit_policies
          set valid_to = (${input.validFrom}::date - 1)
          where id = ${current.id}
        `;
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.customer_credit_policies (
          customer_id, credit_limit, allowed_overdue_days, valid_from,
          version, change_reason, created_by
        ) values (
          ${input.customerId}, ${input.creditLimit}, ${input.allowedOverdueDays},
          ${input.validFrom}, ${current ? current.version + 1 : 1},
          ${input.changeReason}, ${actorId}
        ) returning id
      `;
      const id = insertedId(row);
      await appendTimeline(sql, {
        customerId: input.customerId,
        eventType: "CREDIT_POLICY_CREATED",
        title: "Tạo version chính sách tín dụng",
        detail: `Hạn mức ${input.creditLimit} VND · hiệu lực ${input.validFrom}`,
        actorId,
      });
      return { id, kind: input.kind };
    }
    case "credit-override": {
      await assertDatabasePermission(sql, actorId, "customer_credit.override");
      if (input.reason.trim().length < 10) {
        throw new PlatformError(
          "Lý do vượt chặn tín dụng phải có ít nhất 10 ký tự.",
          "CREDIT_OVERRIDE_REASON_REQUIRED",
          400,
        );
      }
      const [context] = await sql<
        {
          policy_id: string | null;
          credit_limit: string | null;
          allowed_overdue_days: number | null;
          receivable_amount: string;
          uninvoiced_order_amount: string;
          overdue_amount: string;
          oldest_overdue_days: number;
          customer_advance_amount: string;
          is_blocked: boolean;
        }[]
      >`
        select policy.id as policy_id, policy.credit_limit,
          policy.allowed_overdue_days,
          coalesce(exposure.receivable_amount, 0) as receivable_amount,
          coalesce(exposure.uninvoiced_order_amount, 0) as uninvoiced_order_amount,
          coalesce(exposure.overdue_amount, 0) as overdue_amount,
          coalesce(exposure.oldest_overdue_days, 0) as oldest_overdue_days,
          coalesce(exposure.customer_advance_amount, 0) as customer_advance_amount,
          (
            policy.id is null
            or greatest(
              coalesce(exposure.receivable_amount, 0)
              + coalesce(exposure.uninvoiced_order_amount, 0)
              + ${input.orderAmount}::numeric
              - coalesce(exposure.customer_advance_amount, 0),
              0
            ) > coalesce(policy.credit_limit, 0)
            or (
              coalesce(exposure.overdue_amount, 0) > 0
              and coalesce(exposure.oldest_overdue_days, 0)
                > coalesce(policy.allowed_overdue_days, 0)
            )
          ) as is_blocked
        from (select 1) as seed
        left join lateral (
          select * from public.customer_credit_policies
          where customer_id = ${input.customerId}
            and current_date between valid_from and coalesce(valid_to, 'infinity'::date)
          order by version desc limit 1
        ) as policy on true
        left join public.customer_credit_exposures as exposure
          on exposure.customer_id = ${input.customerId}
      `;
      if (!context?.is_blocked) {
        throw new PlatformError(
          "Khách hàng hiện không bị chặn tín dụng nên không cần vượt chặn.",
          "CREDIT_NOT_BLOCKED",
          409,
        );
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.customer_credit_override_events (
          customer_id, policy_id, order_amount, reason, exposure_snapshot,
          approved_by
        ) values (
          ${input.customerId}, ${context.policy_id}, ${input.orderAmount},
          ${input.reason}, ${sql.json(context)}, ${actorId}
        ) returning id
      `;
      const id = insertedId(row);
      await appendTimeline(sql, {
        customerId: input.customerId,
        eventType: "CREDIT_OVERRIDE_APPROVED",
        title: "Phê duyệt vượt chặn tín dụng",
        detail: input.reason,
        actorId,
      });
      return { id, kind: input.kind };
    }
  }
}
