import "server-only";

import { randomUUID } from "node:crypto";

import type { JSONValue, Sql, TransactionSql } from "postgres";

import { observeRead } from "@/lib/postgres/read-observability";

import type { CommercialCommandInput } from "@/modules/commercial/commands";
import { evaluatePriceSafety } from "@/modules/commercial/price-safety";
import type {
  CommercialSnapshot,
  PriceSafetyStatus,
  QuotationRevisionStatus,
  QuotationStatus,
  SalesOrderStatus,
} from "@/modules/commercial/types";
import type {
  CustomerTier,
  PriceRuleScope,
} from "@/modules/customer-360/types";
import {
  assertPermission,
  hasPermission,
} from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";

async function assertDatabasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: Permission,
) {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}

function missing(message: string): never {
  throw new PlatformError(message, "COMMERCIAL_RECORD_NOT_FOUND", 404);
}

function conflict(message: string, code = "INVALID_COMMERCIAL_STATE"): never {
  throw new PlatformError(message, code, 409);
}

export async function readCommercialSnapshot(
  sql: Sql | TransactionSql,
  principal: Principal,
): Promise<CommercialSnapshot> {
  assertPermission(principal, "quotation.read");
  assertPermission(principal, "sales_order.read");
  await observeRead("commercial.permission.quotation", () =>
    assertDatabasePermission(sql, principal.userId, "quotation.read"),
  );
  await observeRead("commercial.permission.sales-order", () =>
    assertDatabasePermission(sql, principal.userId, "sales_order.read"),
  );

  const [
    customerRows,
    siteRows,
    materialRows,
    uomRows,
    priceRuleRows,
    creditPolicyRows,
    exposureRows,
    quotationRows,
    revisionRows,
    quotationLineRows,
    salesOrderRows,
    salesOrderLineRows,
    requirementRows,
  ] = await Promise.all([
    observeRead("commercial.customers", () => sql<
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
    >`select id, code, name_vi as name, legal_name, tax_code, phone, email, tier, is_active
      from public.customers order by is_active desc, code`),
    observeRead("commercial.sites", () => sql<
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
    >`select id, customer_id, code, name_vi as name, address, delivery_notes,
        is_default, is_active from public.customer_sites
      order by is_active desc, is_default desc, code`),
    observeRead("commercial.materials", () => sql<
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
    >`select material.id, material.code, material.name_vi as name,
        material.material_group_id as group_id, material_group.name_vi as group_name,
        material.sales_uom_id, uom.symbol as sales_uom_symbol, material.is_active
      from public.materials as material
      join public.material_groups as material_group on material_group.id = material.material_group_id
      join public.uom_catalog as uom on uom.id = material.sales_uom_id
      order by material.is_active desc, material.code`),
    observeRead("commercial.uoms", () => sql<
      { id: string; symbol: string; name: string; is_active: boolean }[]
    >`select id, symbol, name_vi as name, is_active
      from public.uom_catalog order by is_active desc, code`),
    observeRead("commercial.price-rules", () => sql<
      {
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
      }[]
    >`select rule.id, rule.scope, rule.customer_id, customer.name_vi as customer_name,
        rule.customer_tier, rule.material_id, material.name_vi as material_name,
        rule.material_group_id, material_group.name_vi as material_group_name,
        rule.unit_price, rule.currency, rule.uom_id, uom.symbol as uom_symbol,
        rule.valid_from::text, rule.valid_to::text, rule.version, rule.change_reason
      from public.customer_price_rules as rule
      left join public.customers as customer on customer.id = rule.customer_id
      left join public.materials as material on material.id = rule.material_id
      left join public.material_groups as material_group on material_group.id = rule.material_group_id
      join public.uom_catalog as uom on uom.id = rule.uom_id
      order by rule.valid_to is null desc, rule.valid_from desc, rule.version desc`),
    observeRead("commercial.credit-policies", () => sql<
      {
        id: string;
        customer_id: string;
        credit_limit: string;
        allowed_overdue_days: number;
        valid_from: string;
        valid_to: string | null;
        version: number;
        change_reason: string;
      }[]
    >`select id, customer_id, credit_limit, allowed_overdue_days,
        valid_from::text, valid_to::text, version, change_reason
      from public.customer_credit_policies
      order by valid_to is null desc, valid_from desc, version desc`),
    observeRead("commercial.credit-exposures", () => sql<
      {
        customer_id: string;
        receivable_amount: string;
        uninvoiced_order_amount: string;
        overdue_amount: string;
        oldest_overdue_days: number;
        customer_advance_amount: string;
        calculated_at: string;
      }[]
    >`select customer_id, receivable_amount, uninvoiced_order_amount,
        overdue_amount, oldest_overdue_days, customer_advance_amount,
        calculated_at::text from public.customer_credit_exposures`),
    observeRead("commercial.quotations", () => sql<
      {
        id: string;
        quotation_number: string;
        customer_id: string;
        customer_code: string;
        customer_name: string;
        customer_site_id: string | null;
        customer_site_name: string | null;
        status: QuotationStatus;
        active_revision_id: string;
        owner_user_id: string;
        created_at: string;
      }[]
    >`select quote.id, quote.quotation_number, quote.customer_id,
        customer.code as customer_code, customer.name_vi as customer_name,
        quote.customer_site_id, site.name_vi as customer_site_name,
        quote.status, quote.active_revision_id, quote.owner_user_id, quote.created_at::text
      from public.quotations as quote
      join public.customers as customer on customer.id = quote.customer_id
      left join public.customer_sites as site on site.id = quote.customer_site_id
      order by quote.created_at desc`),
    observeRead("commercial.revisions", () => sql<
      {
        id: string;
        quotation_id: string;
        revision_number: number;
        status: QuotationRevisionStatus;
        valid_until: string;
        currency: string;
        subtotal_amount: string;
        total_amount: string;
        notes: string | null;
        sent_at: string | null;
        accepted_at: string | null;
        locked_at: string | null;
        created_at: string;
      }[]
    >`select id, quotation_id, revision_number, status, valid_until::text,
        currency, subtotal_amount, total_amount, notes, sent_at::text,
        accepted_at::text, locked_at::text, created_at::text
      from public.quotation_revisions order by created_at desc, revision_number desc`),
    observeRead("commercial.quotation-lines", () => sql<
      {
        id: string;
        revision_id: string;
        line_number: number;
        material_id: string;
        material_code_snapshot: string;
        material_name_snapshot: string;
        quantity: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        uom_snapshot: CommercialSnapshot["quotationLines"][number]["uomSnapshot"];
        price_rule_id: string;
        price_snapshot_id: string;
        reference_unit_price: string;
        unit_price: string;
        currency: string;
        line_amount: string;
        price_safety_status: PriceSafetyStatus;
        price_override_reason: string | null;
        price_approved_by: string | null;
        price_approved_at: string | null;
        price_refreshed_at: string;
      }[]
    >`select id, revision_id, line_number, material_id, material_code_snapshot,
        material_name_snapshot, quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
        price_rule_id, price_snapshot_id, reference_unit_price, unit_price,
        currency, line_amount, price_safety_status, price_override_reason,
        price_approved_by, price_approved_at::text, price_refreshed_at::text
      from public.quotation_lines order by revision_id, line_number`),
    observeRead("commercial.sales-orders", () => sql<
      {
        id: string;
        sales_order_number: string;
        quotation_id: string;
        quotation_revision_id: string;
        customer_id: string;
        customer_code_snapshot: string;
        customer_name_snapshot: string;
        customer_site_id: string | null;
        customer_site_name_snapshot: string | null;
        status: SalesOrderStatus;
        currency: string;
        total_amount: string;
        credit_status: CommercialSnapshot["salesOrders"][number]["creditStatus"];
        credit_decision_snapshot: Record<string, unknown> | null;
        confirmed_at: string | null;
        created_at: string;
      }[]
    >`select id, sales_order_number, quotation_id, quotation_revision_id,
        customer_id, customer_code_snapshot, customer_name_snapshot,
        customer_site_id, customer_site_name_snapshot, status, currency,
        total_amount, credit_status, credit_decision_snapshot,
        confirmed_at::text, created_at::text
      from public.sales_orders order by created_at desc`),
    observeRead("commercial.sales-order-lines", () => sql<
      {
        id: string;
        sales_order_id: string;
        source_quotation_line_id: string;
        line_number: number;
        material_id: string;
        material_code_snapshot: string;
        material_name_snapshot: string;
        ordered_quantity: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        uom_snapshot: CommercialSnapshot["salesOrderLines"][number]["uomSnapshot"];
        price_snapshot_id: string;
        price_rule_id: string;
        reference_unit_price: string;
        unit_price: string;
        currency: string;
        line_amount: string;
        price_safety_status: PriceSafetyStatus;
      }[]
    >`select id, sales_order_id, source_quotation_line_id, line_number,
        material_id, material_code_snapshot, material_name_snapshot,
        ordered_quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
        price_snapshot_id, price_rule_id, reference_unit_price, unit_price,
        currency, line_amount, price_safety_status
      from public.sales_order_lines order by sales_order_id, line_number`),
    observeRead("commercial.fulfillment-requirements", () => sql<
      {
        id: string;
        sales_order_id: string;
        sales_order_line_id: string;
        requirement_type: "MATERIAL_DELIVERY";
        status: CommercialSnapshot["fulfillmentRequirements"][number]["status"];
        required_quantity: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        customer_site_id: string | null;
        created_at: string;
      }[]
    >`select id, sales_order_id, sales_order_line_id, requirement_type, status,
        required_quantity, uom_id, uom_symbol_snapshot, customer_site_id,
        created_at::text from public.fulfillment_requirements
      order by created_at desc`),
  ]);

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
    quotations: quotationRows.map((row) => ({
      id: row.id,
      quotationNumber: row.quotation_number,
      customerId: row.customer_id,
      customerCode: row.customer_code,
      customerName: row.customer_name,
      customerSiteId: row.customer_site_id,
      customerSiteName: row.customer_site_name,
      status: row.status,
      activeRevisionId: row.active_revision_id,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
    })),
    revisions: revisionRows.map((row) => ({
      id: row.id,
      quotationId: row.quotation_id,
      revisionNumber: row.revision_number,
      status: row.status,
      validUntil: row.valid_until,
      currency: row.currency,
      subtotalAmount: row.subtotal_amount,
      totalAmount: row.total_amount,
      notes: row.notes,
      sentAt: row.sent_at,
      acceptedAt: row.accepted_at,
      lockedAt: row.locked_at,
      createdAt: row.created_at,
    })),
    quotationLines: quotationLineRows.map((row) => ({
      id: row.id,
      revisionId: row.revision_id,
      lineNumber: row.line_number,
      materialId: row.material_id,
      materialCode: row.material_code_snapshot,
      materialName: row.material_name_snapshot,
      quantity: row.quantity,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol_snapshot,
      uomSnapshot: row.uom_snapshot,
      priceRuleId: row.price_rule_id,
      priceSnapshotId: row.price_snapshot_id,
      referenceUnitPrice: row.reference_unit_price,
      unitPrice: row.unit_price,
      currency: row.currency,
      lineAmount: row.line_amount,
      priceSafetyStatus: row.price_safety_status,
      priceOverrideReason: row.price_override_reason,
      priceApprovedBy: row.price_approved_by,
      priceApprovedAt: row.price_approved_at,
      priceRefreshedAt: row.price_refreshed_at,
    })),
    salesOrders: salesOrderRows.map((row) => ({
      id: row.id,
      salesOrderNumber: row.sales_order_number,
      quotationId: row.quotation_id,
      quotationRevisionId: row.quotation_revision_id,
      customerId: row.customer_id,
      customerCode: row.customer_code_snapshot,
      customerName: row.customer_name_snapshot,
      customerSiteId: row.customer_site_id,
      customerSiteName: row.customer_site_name_snapshot,
      status: row.status,
      currency: row.currency,
      totalAmount: row.total_amount,
      creditStatus: row.credit_status,
      creditDecisionSnapshot: row.credit_decision_snapshot,
      confirmedAt: row.confirmed_at,
      createdAt: row.created_at,
    })),
    salesOrderLines: salesOrderLineRows.map((row) => ({
      id: row.id,
      salesOrderId: row.sales_order_id,
      sourceQuotationLineId: row.source_quotation_line_id,
      lineNumber: row.line_number,
      materialId: row.material_id,
      materialCode: row.material_code_snapshot,
      materialName: row.material_name_snapshot,
      orderedQuantity: row.ordered_quantity,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol_snapshot,
      uomSnapshot: row.uom_snapshot,
      priceSnapshotId: row.price_snapshot_id,
      priceRuleId: row.price_rule_id,
      referenceUnitPrice: row.reference_unit_price,
      unitPrice: row.unit_price,
      currency: row.currency,
      lineAmount: row.line_amount,
      priceSafetyStatus: row.price_safety_status,
    })),
    fulfillmentRequirements: requirementRows.map((row) => ({
      id: row.id,
      salesOrderId: row.sales_order_id,
      salesOrderLineId: row.sales_order_line_id,
      requirementType: row.requirement_type,
      status: row.status,
      requiredQuantity: row.required_quantity,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol_snapshot,
      customerSiteId: row.customer_site_id,
      createdAt: row.created_at,
    })),
  };
}

async function findDraftContext(sql: TransactionSql, revisionId: string) {
  const [row] = await sql<
    {
      revision_id: string;
      quotation_id: string;
      customer_id: string;
      status: QuotationRevisionStatus;
      valid_until: string;
    }[]
  >`select revision.id as revision_id, revision.quotation_id, quote.customer_id,
      revision.status, revision.valid_until::text
    from public.quotation_revisions as revision
    join public.quotations as quote on quote.id = revision.quotation_id
    where revision.id = ${revisionId}
    for update of revision, quote`;
  if (!row) missing("Không tìm thấy phiên bản báo giá.");
  if (row.status !== "DRAFT")
    conflict("Phiên bản báo giá đã khóa.", "QUOTATION_REVISION_LOCKED");
  return row;
}

export async function executeCommercialCommand(
  sql: TransactionSql,
  principal: Principal,
  input: CommercialCommandInput,
) {
  switch (input.kind) {
    case "quotation.create": {
      await assertDatabasePermission(sql, principal.userId, "quotation.create");
      const [customer] = await sql<{ id: string }[]>`
        select id from public.customers where id = ${input.customerId} and is_active`;
      if (!customer)
        missing("Khách hàng không tồn tại hoặc đã ngưng hoạt động.");
      if (input.customerSiteId) {
        const [site] = await sql<{ id: string }[]>`
          select id from public.customer_sites
          where id = ${input.customerSiteId} and customer_id = ${input.customerId} and is_active`;
        if (!site)
          missing("Địa điểm giao hàng không thuộc khách hàng đã chọn.");
      }
      const [quote] = await sql<{ id: string; quotation_number: string }[]>`
        insert into public.quotations (
          quotation_number, customer_id, customer_site_id, owner_user_id, created_by
        ) values (
          'BG-' || to_char(current_date, 'YYYY') || '-' ||
            lpad(nextval('public.quotation_number_seq')::text, 5, '0'),
          ${input.customerId}, ${input.customerSiteId}, ${principal.userId}, ${principal.userId}
        ) returning id, quotation_number`;
      if (!quote)
        throw new PlatformError(
          "Không thể tạo báo giá.",
          "QUOTATION_CREATE_FAILED",
          500,
        );
      const [revision] = await sql<{ id: string }[]>`
        insert into public.quotation_revisions (
          quotation_id, revision_number, valid_until, notes, created_by
        ) values (${quote.id}, 1, ${input.validUntil}, ${input.notes}, ${principal.userId})
        returning id`;
      if (!revision)
        throw new PlatformError(
          "Không thể tạo phiên bản báo giá.",
          "QUOTATION_CREATE_FAILED",
          500,
        );
      await sql`update public.quotations set active_revision_id = ${revision.id} where id = ${quote.id}`;
      return {
        id: quote.id,
        revisionId: revision.id,
        number: quote.quotation_number,
      };
    }

    case "quotation.add-line": {
      await assertDatabasePermission(sql, principal.userId, "quotation.create");
      const context = await findDraftContext(sql, input.revisionId);
      const [material] = await sql<
        { id: string; code: string; name: string; sales_uom_id: string }[]
      >`select id, code, name_vi as name, sales_uom_id
        from public.materials where id = ${input.materialId} and is_active`;
      if (!material) missing("Vật liệu không tồn tại hoặc đã ngưng sử dụng.");
      const [resolved] = await sql<
        {
          rule_id: string;
          unit_price: string;
          currency: string;
          uom_id: string;
        }[]
      >`select rule_id, unit_price, currency, uom_id
        from app_private.resolve_customer_price(
          ${context.customer_id}, ${input.materialId}, current_date
        )`;
      if (!resolved) {
        throw new PlatformError(
          "Vật liệu chưa có giá bán hiệu lực.",
          "NO_EFFECTIVE_SELLING_PRICE",
          422,
        );
      }
      if (
        resolved.uom_id !== input.uomId ||
        material.sales_uom_id !== input.uomId
      ) {
        throw new PlatformError(
          "Đơn vị báo giá phải khớp đơn vị bán và đơn vị của quy tắc giá.",
          "QUOTATION_UOM_PRICE_MISMATCH",
          422,
        );
      }
      const requested = input.requestedUnitPrice ?? resolved.unit_price;
      const safety = evaluatePriceSafety({
        referenceUnitPrice: resolved.unit_price,
        requestedUnitPrice: requested,
        canOverride: hasPermission(principal, "price.override"),
        reason: input.priceOverrideReason ?? "",
      });
      if (safety.status === "APPROVED_OVERRIDE") {
        await assertDatabasePermission(sql, principal.userId, "price.override");
      }
      const [uom] = await sql<
        {
          id: string;
          code: string;
          name: string;
          symbol: string;
          decimal_scale: number;
        }[]
      >`select id, code, name_vi as name, symbol, decimal_scale
        from public.uom_catalog where id = ${input.uomId} and is_active`;
      if (!uom) missing("Đơn vị tính không tồn tại hoặc đã ngưng sử dụng.");
      const [nextLine] = await sql<{ number: number }[]>`
        select coalesce(max(line_number), 0)::integer + 1 as number
        from public.quotation_lines where revision_id = ${input.revisionId}`;
      const lineNumber = nextLine?.number ?? 1;
      const transactionRef = `QUOTE:${input.revisionId}:${lineNumber}:${randomUUID()}`;
      const [snapshot] = await sql<{ id: string }[]>`
        select app_private.capture_selling_price_snapshot(
          ${context.customer_id}, ${input.materialId}, current_date,
          ${transactionRef}, ${principal.userId}
        ) as id`;
      if (!snapshot)
        throw new PlatformError(
          "Không thể chụp giá bán.",
          "PRICE_SNAPSHOT_FAILED",
          500,
        );
      const [line] = await sql<{ id: string }[]>`
        insert into public.quotation_lines (
          revision_id, line_number, material_id, material_code_snapshot,
          material_name_snapshot, quantity, uom_id, uom_symbol_snapshot,
          uom_snapshot, price_rule_id, price_snapshot_id, reference_unit_price,
          unit_price, currency, price_safety_status, price_override_reason,
          price_approved_by, price_approved_at, created_by
        ) values (
          ${input.revisionId}, ${lineNumber}, ${material.id}, ${material.code},
          ${material.name}, ${input.quantity}, ${uom.id}, ${uom.symbol},
          ${sql.json({ code: uom.code, name: uom.name, symbol: uom.symbol, decimalScale: uom.decimal_scale })},
          ${resolved.rule_id}, ${snapshot.id}, ${resolved.unit_price}, ${requested},
          ${resolved.currency}, ${safety.status},
          ${safety.status === "APPROVED_OVERRIDE" ? input.priceOverrideReason : null},
          ${safety.status === "APPROVED_OVERRIDE" ? principal.userId : null},
          ${safety.status === "APPROVED_OVERRIDE" ? new Date() : null},
          ${principal.userId}
        ) returning id`;
      if (!line)
        throw new PlatformError(
          "Không thể thêm dòng báo giá.",
          "QUOTATION_LINE_FAILED",
          500,
        );
      if (safety.status === "APPROVED_OVERRIDE") {
        await sql`insert into public.price_approval_events (
          quotation_line_id, reference_unit_price, approved_unit_price,
          discount_percent, reason, approved_by
        ) values (
          ${line.id}, ${resolved.unit_price}, ${requested}, ${safety.discountPercent},
          ${input.priceOverrideReason}, ${principal.userId}
        )`;
      }
      return { id: line.id, revisionId: input.revisionId, lineNumber };
    }

    case "quotation.refresh-prices": {
      await assertDatabasePermission(sql, principal.userId, "quotation.create");
      const context = await findDraftContext(sql, input.revisionId);
      const lines = await sql<
        { id: string; line_number: number; material_id: string }[]
      >`select id, line_number, material_id from public.quotation_lines
        where revision_id = ${input.revisionId} order by line_number for update`;
      for (const line of lines) {
        const [resolved] = await sql<
          {
            rule_id: string;
            unit_price: string;
            currency: string;
            uom_id: string;
          }[]
        >`select rule_id, unit_price, currency, uom_id
          from app_private.resolve_customer_price(
            ${context.customer_id}, ${line.material_id}, current_date
          )`;
        if (!resolved) {
          throw new PlatformError(
            "Có vật liệu chưa có giá hiệu lực.",
            "NO_EFFECTIVE_SELLING_PRICE",
            422,
          );
        }
        const [snapshot] = await sql<{ id: string }[]>`
          select app_private.capture_selling_price_snapshot(
            ${context.customer_id}, ${line.material_id}, current_date,
            ${`QREFRESH:${input.revisionId}:${line.id}:${randomUUID()}`}, ${principal.userId}
          ) as id`;
        if (!snapshot) {
          throw new PlatformError(
            "Không thể chụp lại giá bán.",
            "PRICE_SNAPSHOT_FAILED",
            500,
          );
        }
        await sql`update public.quotation_lines
          set price_rule_id = ${resolved.rule_id}, price_snapshot_id = ${snapshot.id},
              reference_unit_price = ${resolved.unit_price}, unit_price = ${resolved.unit_price},
              currency = ${resolved.currency}, price_safety_status = 'RULE_MATCH',
              price_override_reason = null, price_approved_by = null,
              price_approved_at = null, price_refreshed_at = now()
          where id = ${line.id}`;
      }
      return { id: input.revisionId, refreshedLines: lines.length };
    }

    case "quotation.send": {
      await assertDatabasePermission(sql, principal.userId, "quotation.send");
      const context = await findDraftContext(sql, input.revisionId);
      const [lineCount] = await sql<{ count: number }[]>`
        select count(*)::integer as count from public.quotation_lines
        where revision_id = ${input.revisionId}`;
      if (!lineCount?.count) conflict("Báo giá cần ít nhất một dòng vật liệu.");
      if (context.valid_until < new Date().toISOString().slice(0, 10)) {
        conflict("Báo giá đã hết hiệu lực và không thể gửi.");
      }
      await sql`update public.quotation_revisions
        set status = 'SENT', sent_at = now(), locked_at = now()
        where id = ${input.revisionId}`;
      await sql`update public.quotations set status = 'SENT'
        where id = ${context.quotation_id}`;
      return { id: input.revisionId, status: "SENT" };
    }

    case "quotation.accept": {
      await assertDatabasePermission(sql, principal.userId, "quotation.accept");
      const [revision] = await sql<
        { quotation_id: string; status: QuotationRevisionStatus }[]
      >`
        select quotation_id, status from public.quotation_revisions
        where id = ${input.revisionId} for update`;
      if (!revision) missing("Không tìm thấy phiên bản báo giá.");
      if (revision.status !== "SENT")
        conflict("Chỉ báo giá đã gửi mới được chấp nhận.");
      await sql`update public.quotation_revisions
        set status = 'ACCEPTED', accepted_at = now()
        where id = ${input.revisionId}`;
      await sql`update public.quotations set status = 'ACCEPTED'
        where id = ${revision.quotation_id}`;
      return { id: input.revisionId, status: "ACCEPTED" };
    }

    case "quotation.revise": {
      await assertDatabasePermission(sql, principal.userId, "quotation.create");
      const [source] = await sql<
        {
          quotation_id: string;
          revision_number: number;
          status: QuotationRevisionStatus;
          currency: string;
          notes: string | null;
        }[]
      >`select quotation_id, revision_number, status, currency, notes
        from public.quotation_revisions where id = ${input.revisionId} for update`;
      if (!source) missing("Không tìm thấy phiên bản báo giá.");
      if (source.status !== "SENT")
        conflict("Chỉ báo giá đã gửi mới tạo revision thay thế.");
      await sql`update public.quotation_revisions set status = 'SUPERSEDED'
        where id = ${input.revisionId}`;
      const [revision] = await sql<{ id: string }[]>`
        insert into public.quotation_revisions (
          quotation_id, revision_number, valid_until, currency, notes, created_by
        ) values (
          ${source.quotation_id}, ${source.revision_number + 1}, ${input.validUntil},
          ${source.currency}, ${source.notes}, ${principal.userId}
        ) returning id`;
      if (!revision)
        throw new PlatformError(
          "Không thể tạo revision.",
          "QUOTATION_REVISION_FAILED",
          500,
        );
      await sql`insert into public.quotation_lines (
        revision_id, line_number, material_id, material_code_snapshot,
        material_name_snapshot, quantity, uom_id, uom_symbol_snapshot,
        uom_snapshot, price_rule_id, price_snapshot_id, reference_unit_price,
        unit_price, currency, price_safety_status, price_override_reason,
        price_approved_by, price_approved_at, price_refreshed_at, created_by
      ) select ${revision.id}, line_number, material_id, material_code_snapshot,
        material_name_snapshot, quantity, uom_id, uom_symbol_snapshot,
        uom_snapshot, price_rule_id, price_snapshot_id, reference_unit_price,
        unit_price, currency, price_safety_status, price_override_reason,
        price_approved_by, price_approved_at, price_refreshed_at, ${principal.userId}
      from public.quotation_lines where revision_id = ${input.revisionId}`;
      await sql`update public.quotations
        set active_revision_id = ${revision.id}, status = 'DRAFT'
        where id = ${source.quotation_id}`;
      return { id: revision.id, quotationId: source.quotation_id };
    }

    case "sales-order.convert": {
      await assertDatabasePermission(
        sql,
        principal.userId,
        "sales_order.create",
      );
      const [revision] = await sql<
        {
          id: string;
          quotation_id: string;
          status: QuotationRevisionStatus;
          currency: string;
          total_amount: string;
          customer_id: string;
          customer_code: string;
          customer_name: string;
          customer_site_id: string | null;
          customer_site_name: string | null;
        }[]
      >`select revision.id, revision.quotation_id, revision.status,
          revision.currency, revision.total_amount, quote.customer_id,
          customer.code as customer_code, customer.name_vi as customer_name,
          quote.customer_site_id, site.name_vi as customer_site_name
        from public.quotation_revisions as revision
        join public.quotations as quote on quote.id = revision.quotation_id
        join public.customers as customer on customer.id = quote.customer_id
        left join public.customer_sites as site on site.id = quote.customer_site_id
        where revision.id = ${input.revisionId} for update of revision, quote`;
      if (!revision) missing("Không tìm thấy phiên bản báo giá.");
      if (revision.status !== "ACCEPTED")
        conflict("Chỉ báo giá đã chấp nhận mới chuyển thành đơn bán.");
      const [existing] = await sql<
        { id: string; sales_order_number: string }[]
      >`
        select id, sales_order_number from public.sales_orders
        where quotation_revision_id = ${input.revisionId}`;
      if (existing)
        return { id: existing.id, number: existing.sales_order_number };
      const [order] = await sql<{ id: string; sales_order_number: string }[]>`
        insert into public.sales_orders (
          sales_order_number, quotation_id, quotation_revision_id, customer_id,
          customer_code_snapshot, customer_name_snapshot, customer_site_id,
          customer_site_name_snapshot, currency, total_amount, created_by
        ) values (
          'SO-' || to_char(current_date, 'YYYY') || '-' ||
            lpad(nextval('public.sales_order_number_seq')::text, 5, '0'),
          ${revision.quotation_id}, ${revision.id}, ${revision.customer_id},
          ${revision.customer_code}, ${revision.customer_name}, ${revision.customer_site_id},
          ${revision.customer_site_name}, ${revision.currency}, ${revision.total_amount},
          ${principal.userId}
        ) returning id, sales_order_number`;
      if (!order)
        throw new PlatformError(
          "Không thể tạo đơn bán.",
          "SALES_ORDER_CREATE_FAILED",
          500,
        );
      await sql`insert into public.sales_order_lines (
        sales_order_id, source_quotation_line_id, line_number, material_id,
        material_code_snapshot, material_name_snapshot, ordered_quantity,
        uom_id, uom_symbol_snapshot, uom_snapshot, price_rule_id,
        price_snapshot_id, reference_unit_price, unit_price, currency,
        line_amount, price_safety_status
      ) select ${order.id}, id, line_number, material_id, material_code_snapshot,
        material_name_snapshot, quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
        price_rule_id, price_snapshot_id, reference_unit_price, unit_price,
        currency, line_amount, price_safety_status
      from public.quotation_lines where revision_id = ${revision.id}`;
      return { id: order.id, number: order.sales_order_number };
    }

    case "sales-order.confirm": {
      await assertDatabasePermission(
        sql,
        principal.userId,
        "sales_order.confirm",
      );
      const [result] = await sql<{ result: JSONValue }[]>`
        select app_private.confirm_sales_order(
          ${input.salesOrderId}, ${principal.userId}, ${input.creditOverrideReason}
        ) as result`;
      if (!result)
        throw new PlatformError(
          "Không thể xác nhận đơn bán.",
          "SALES_ORDER_CONFIRM_FAILED",
          500,
        );
      return result.result;
    }
  }
}
