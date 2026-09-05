import { SNAPSHOT_PAGE_SIZE, snapshotPage, type SnapshotView } from "@/modules/platform/snapshot-view";
import { observeRead } from "@/lib/postgres/read-observability";
import "server-only";

import { randomUUID } from "node:crypto";

import type { JSONValue, Sql, TransactionSql } from "postgres";

import type { SourcingCommandInput } from "@/modules/sourcing/commands";
import type { CustomerTier } from "@/modules/customer-360/types";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";
import { validateSourcingRoute } from "@/modules/sourcing/workflow";
import type {
  PurchaseOrderStatus,
  SourcingMode,
  SourcingSnapshot,
} from "@/modules/sourcing/types";

async function assertDatabasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: Permission,
) {
  await observeRead("sourcing.permission", () => sql`select app_private.assert_actor_permission(${actorId}, ${permission})`);
}

function missing(message: string): never {
  throw new PlatformError(message, "SOURCING_RECORD_NOT_FOUND", 404);
}

function conflict(message: string, code = "INVALID_SOURCING_STATE"): never {
  throw new PlatformError(message, code, 409);
}

export async function readSourcingSnapshot(
  sql: Sql | TransactionSql,
  principal: Principal,
  view?: SnapshotView,
): Promise<SourcingSnapshot> {
  assertPermission(principal, "sourcing.read");
  assertPermission(principal, "purchase_order.read");
  await assertDatabasePermission(sql, principal.userId, "sourcing.read");
  await assertDatabasePermission(sql, principal.userId, "purchase_order.read");

  const candidates = view ? await observeRead("sourcing.page", () =>
    view.tab === "orders"
      ? sql<{ id: string }[]>`select id from public.purchase_orders where (${view.after ?? null}::uuid is null or id > ${view.after ?? null}::uuid) order by id limit ${SNAPSHOT_PAGE_SIZE + 1}`
      : view.tab === "suppliers"
        ? sql<{ id: string }[]>`select id from public.suppliers where (${view.after ?? null}::uuid is null or id > ${view.after ?? null}::uuid) order by id limit ${SNAPSHOT_PAGE_SIZE + 1}`
        : sql<{ id: string }[]>`select line.id from public.sales_order_lines line join public.sales_orders so on so.id = line.sales_order_id where (so.status in ('CONFIRMED', 'FULFILLING') or exists (select 1 from public.supply_allocations history where history.sales_order_line_id = line.id)) and (${view.after ?? null}::uuid is null or line.id > ${view.after ?? null}::uuid) order by line.id limit ${SNAPSHOT_PAGE_SIZE + 1}`
  ) : [];
  const selected = snapshotPage(candidates, view);
  const ids = selected.rows.map(row => row.id);

  const [
    supplierRows,
    supplierPriceRows,
    costSnapshotRows,
    purchaseOrderRows,
    purchaseOrderLineRows,
    allocationRows,
    evidenceRows,
    salesOrderLineRows,
    requirementRows,
    customerRows,
    siteRows,
    materialRows,
    uomRows,
    warehouseRows,
  ] = await Promise.all([
    (!view || view.tab !== "orders") ? observeRead("sourcing.readSourcingSnapshot.1", () => sql<
      {
        id: string;
        code: string;
        name: string;
        tax_code: string | null;
        phone: string | null;
        email: string | null;
        address: string | null;
        is_active: boolean;
        created_at: string;
      }[]
    >`select id, code, name_vi as name, tax_code, phone, email, address,
        is_active, created_at::text from public.suppliers
      where (${!view || view.tab !== "suppliers"} or id = any(${sql.array(ids, 2950)}))
      order by is_active desc, code`) : [],
    (!view || view.tab === "suppliers") ? observeRead("sourcing.readSourcingSnapshot.2", () => sql<
      {
        id: string;
        supplier_id: string;
        supplier_name: string;
        material_id: string;
        material_code: string;
        material_name: string;
        uom_id: string;
        uom_symbol: string;
        unit_cost: string;
        currency: string;
        valid_from: string;
        valid_to: string | null;
        version: number;
        change_reason: string;
      }[]
    >`select price.id, price.supplier_id, supplier.name_vi as supplier_name,
        price.material_id, material.code as material_code,
        material.name_vi as material_name, price.uom_id, uom.symbol as uom_symbol,
        price.unit_cost, price.currency, price.valid_from::text,
        price.valid_to::text, price.version, price.change_reason
      from public.supplier_price_history as price
      join public.suppliers as supplier on supplier.id = price.supplier_id
      join public.materials as material on material.id = price.material_id
      join public.uom_catalog as uom on uom.id = price.uom_id
      where (${!view} or price.supplier_id = any(${sql.array(ids, 2950)}))
      order by price.valid_to is null desc, price.valid_from desc, price.version desc`) : [],
    !view ? observeRead("sourcing.readSourcingSnapshot.3", () => sql<
      {
        id: string;
        source_supplier_price_id: string;
        supplier_id: string;
        supplier_code_snapshot: string;
        supplier_name_snapshot: string;
        material_id: string;
        material_code_snapshot: string;
        material_name_snapshot: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        unit_cost: string;
        currency: string;
        supplier_price_version: number;
        captured_at: string;
      }[]
    >`select id, source_supplier_price_id, supplier_id, supplier_code_snapshot,
        supplier_name_snapshot, material_id, material_code_snapshot,
        material_name_snapshot, uom_id, uom_symbol_snapshot, unit_cost,
        currency, supplier_price_version, captured_at::text
      from public.purchase_cost_snapshots order by captured_at desc`) : [],
    (!view || view.tab === "orders") ? observeRead("sourcing.readSourcingSnapshot.4", () => sql<
      {
        id: string;
        purchase_order_number: string;
        supplier_id: string;
        supplier_code_snapshot: string;
        supplier_name_snapshot: string;
        status: PurchaseOrderStatus;
        currency: string;
        total_amount: string;
        delivery_mode: Exclude<SourcingMode, "WAREHOUSE">;
        warehouse_id: string | null;
        warehouse_name: string | null;
        direct_customer_id: string | null;
        direct_customer_name: string | null;
        direct_customer_site_id: string | null;
        direct_customer_site_name: string | null;
        confirmed_at: string | null;
        sent_at: string | null;
        acknowledged_at: string | null;
        created_at: string;
      }[]
    >`select po.id, po.purchase_order_number, po.supplier_id,
        po.supplier_code_snapshot, po.supplier_name_snapshot, po.status,
        po.currency, po.total_amount, po.delivery_mode, po.warehouse_id,
        warehouse.name_vi as warehouse_name, po.direct_customer_id,
        customer.name_vi as direct_customer_name, po.direct_customer_site_id,
        site.name_vi as direct_customer_site_name, po.confirmed_at::text,
        po.sent_at::text, po.acknowledged_at::text, po.created_at::text
      from public.purchase_orders as po
      left join public.warehouses as warehouse on warehouse.id = po.warehouse_id
      left join public.customers as customer on customer.id = po.direct_customer_id
      left join public.customer_sites as site on site.id = po.direct_customer_site_id
      where (${!view} or po.id = any(${sql.array(ids, 2950)}))
      order by po.created_at desc`) : [],
    (!view || view.tab === "orders") ? observeRead("sourcing.readSourcingSnapshot.5", () => sql<
      {
        id: string;
        purchase_order_id: string;
        sales_order_line_id: string;
        supply_allocation_id: string;
        line_number: number;
        material_id: string;
        material_code_snapshot: string;
        material_name_snapshot: string;
        ordered_quantity: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        uom_snapshot: SourcingSnapshot["salesOrderLines"][number]["uomSnapshot"];
        purchase_cost_snapshot_id: string;
        unit_cost: string;
        currency: string;
        line_amount: string;
      }[]
    >`select id, purchase_order_id, sales_order_line_id, supply_allocation_id,
        line_number, material_id, material_code_snapshot, material_name_snapshot,
        ordered_quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
        purchase_cost_snapshot_id, unit_cost, currency, line_amount
      from public.purchase_order_lines where (${!view} or purchase_order_id = any(${sql.array(ids, 2950)})) order by purchase_order_id, line_number`) : [],
    (!view || view.tab === "allocations") ? observeRead("sourcing.readSourcingSnapshot.6", () => sql<
      {
        id: string;
        fulfillment_requirement_id: string;
        sales_order_line_id: string;
        sales_order_number: string;
        material_id: string;
        material_code: string;
        material_name: string;
        sourcing_mode: SourcingMode;
        supplier_id: string | null;
        supplier_name: string | null;
        warehouse_id: string | null;
        warehouse_name: string | null;
        direct_customer_id: string | null;
        direct_customer_name: string | null;
        direct_customer_site_id: string | null;
        direct_customer_site_name: string | null;
        purchase_order_line_id: string | null;
        allocated_quantity: string;
        supplier_delivered_qty: string;
        customer_accepted_qty: string;
        customer_billable_qty: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        status:
          "PLANNED" | "ORDERED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
        created_at: string;
      }[]
    >`select allocation.id, allocation.fulfillment_requirement_id,
        allocation.sales_order_line_id, sales_order.sales_order_number,
        line.material_id, line.material_code_snapshot as material_code,
        line.material_name_snapshot as material_name, allocation.sourcing_mode,
        allocation.supplier_id, supplier.name_vi as supplier_name,
        allocation.warehouse_id, warehouse.name_vi as warehouse_name,
        allocation.direct_customer_id, customer.name_vi as direct_customer_name,
        allocation.direct_customer_site_id, site.name_vi as direct_customer_site_name,
        allocation.purchase_order_line_id, allocation.allocated_quantity,
        allocation.supplier_delivered_qty, allocation.customer_accepted_qty,
        allocation.customer_billable_qty, allocation.uom_id,
        allocation.uom_symbol_snapshot, allocation.status, allocation.created_at::text
      from public.supply_allocations as allocation
      join public.sales_order_lines as line on line.id = allocation.sales_order_line_id
      join public.sales_orders as sales_order on sales_order.id = line.sales_order_id
      left join public.suppliers as supplier on supplier.id = allocation.supplier_id
      left join public.warehouses as warehouse on warehouse.id = allocation.warehouse_id
      left join public.customers as customer on customer.id = allocation.direct_customer_id
      left join public.customer_sites as site on site.id = allocation.direct_customer_site_id
      where (${!view} or allocation.sales_order_line_id = any(${sql.array(ids, 2950)}))
      order by allocation.created_at desc`) : [],
    (!view || view.tab === "orders") ? observeRead("sourcing.readSourcingSnapshot.7", () => sql<
      {
        id: string;
        purchase_order_id: string;
        evidence_id: string;
        label: string;
        created_at: string;
      }[]
    >`select id, purchase_order_id, evidence_id, label, created_at::text
      from public.purchase_order_evidence where (${!view} or purchase_order_id = any(${sql.array(ids, 2950)})) order by created_at desc`) : [],
    (!view || view.tab === "allocations") ? observeRead("sourcing.readSourcingSnapshot.8", () => sql<
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
        uom_snapshot: SourcingSnapshot["salesOrderLines"][number]["uomSnapshot"];
        price_rule_id: string;
        price_snapshot_id: string;
        reference_unit_price: string;
        unit_price: string;
        currency: string;
        line_amount: string;
        price_safety_status: "RULE_MATCH" | "ABOVE_RULE" | "APPROVED_OVERRIDE";
      }[]
    >`select line.id, line.sales_order_id, line.source_quotation_line_id,
        line.line_number, line.material_id, line.material_code_snapshot,
        line.material_name_snapshot, line.ordered_quantity, line.uom_id,
        line.uom_symbol_snapshot, line.uom_snapshot, line.price_rule_id,
        line.price_snapshot_id, line.reference_unit_price, line.unit_price,
        line.currency, line.line_amount, line.price_safety_status
      from public.sales_order_lines as line
      join public.sales_orders as sales_order on sales_order.id = line.sales_order_id
      where sales_order.status in ('CONFIRMED', 'FULFILLING') and (${!view} or line.id = any(${sql.array(ids, 2950)}))
      order by sales_order.created_at desc, line.line_number`) : [],
    (!view || view.tab === "allocations") ? observeRead("sourcing.readSourcingSnapshot.9", () => sql<
      {
        id: string;
        sales_order_id: string;
        sales_order_line_id: string;
        requirement_type: "MATERIAL_DELIVERY";
        status: "PENDING_READINESS" | "READY" | "ALLOCATED" | "CANCELLED";
        required_quantity: string;
        uom_id: string;
        uom_symbol_snapshot: string;
        customer_site_id: string | null;
        created_at: string;
      }[]
    >`select id, sales_order_id, sales_order_line_id, requirement_type, status,
        required_quantity, uom_id, uom_symbol_snapshot, customer_site_id,
        created_at::text from public.fulfillment_requirements
      where status <> 'CANCELLED' and (${!view} or sales_order_line_id = any(${sql.array(ids, 2950)})) order by created_at desc`) : [],
    (!view || view.tab === "allocations") ? observeRead("sourcing.readSourcingSnapshot.10", () => sql<
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
    >`select id, code, name_vi as name, legal_name, tax_code, phone, email,
        tier, is_active from public.customers order by is_active desc, code`) : [],
    (!view || view.tab === "allocations") ? observeRead("sourcing.readSourcingSnapshot.11", () => sql<
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
      order by is_active desc, is_default desc, code`) : [],
    (!view || view.tab === "suppliers") ? observeRead("sourcing.readSourcingSnapshot.12", () => sql<
      {
        id: string;
        code: string;
        name: string;
        group_id: string;
        group_name: string;
        sales_uom_id: string;
        sales_uom_symbol: string;
        purchase_uom_id: string;
        purchase_uom_symbol: string;
        is_active: boolean;
      }[]
    >`select material.id, material.code, material.name_vi as name,
        material.material_group_id as group_id, material_group.name_vi as group_name,
        material.sales_uom_id, sales_uom.symbol as sales_uom_symbol,
        material.purchase_uom_id, purchase_uom.symbol as purchase_uom_symbol,
        material.is_active
      from public.materials as material
      join public.material_groups as material_group on material_group.id = material.material_group_id
      join public.uom_catalog as sales_uom on sales_uom.id = material.sales_uom_id
      join public.uom_catalog as purchase_uom on purchase_uom.id = material.purchase_uom_id
      order by material.is_active desc, material.code`) : [],
    (!view || view.tab === "suppliers") ? observeRead("sourcing.readSourcingSnapshot.13", () => sql<
      { id: string; symbol: string; name: string; is_active: boolean }[]
    >`select id, symbol, name_vi as name, is_active
       from public.uom_catalog order by is_active desc, code`) : [],
    (!view || view.tab === "allocations") ? observeRead("sourcing.readSourcingSnapshot.14", () => sql<
      { id: string; code: string; name: string; is_active: boolean }[]
    >`select id, code, name_vi as name, is_active
       from public.warehouses order by is_active desc, code`) : [],
  ]);

  return {
    page: selected.page,
    suppliers: supplierRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      taxCode: row.tax_code,
      phone: row.phone,
      email: row.email,
      address: row.address,
      isActive: row.is_active,
      createdAt: row.created_at,
    })),
    supplierPrices: supplierPriceRows.map((row) => ({
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      materialId: row.material_id,
      materialCode: row.material_code,
      materialName: row.material_name,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol,
      unitCost: row.unit_cost,
      currency: row.currency,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      version: row.version,
      changeReason: row.change_reason,
    })),
    purchaseCostSnapshots: costSnapshotRows.map((row) => ({
      id: row.id,
      sourceSupplierPriceId: row.source_supplier_price_id,
      supplierId: row.supplier_id,
      supplierCode: row.supplier_code_snapshot,
      supplierName: row.supplier_name_snapshot,
      materialId: row.material_id,
      materialCode: row.material_code_snapshot,
      materialName: row.material_name_snapshot,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol_snapshot,
      unitCost: row.unit_cost,
      currency: row.currency,
      supplierPriceVersion: row.supplier_price_version,
      capturedAt: row.captured_at,
    })),
    purchaseOrders: purchaseOrderRows.map((row) => ({
      id: row.id,
      purchaseOrderNumber: row.purchase_order_number,
      supplierId: row.supplier_id,
      supplierCode: row.supplier_code_snapshot,
      supplierName: row.supplier_name_snapshot,
      status: row.status,
      currency: row.currency,
      totalAmount: row.total_amount,
      deliveryMode: row.delivery_mode,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      directCustomerId: row.direct_customer_id,
      directCustomerName: row.direct_customer_name,
      directCustomerSiteId: row.direct_customer_site_id,
      directCustomerSiteName: row.direct_customer_site_name,
      confirmedAt: row.confirmed_at,
      sentAt: row.sent_at,
      acknowledgedAt: row.acknowledged_at,
      createdAt: row.created_at,
    })),
    purchaseOrderLines: purchaseOrderLineRows.map((row) => ({
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      salesOrderLineId: row.sales_order_line_id,
      supplyAllocationId: row.supply_allocation_id,
      lineNumber: row.line_number,
      materialId: row.material_id,
      materialCode: row.material_code_snapshot,
      materialName: row.material_name_snapshot,
      orderedQuantity: row.ordered_quantity,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol_snapshot,
      uomSnapshot: row.uom_snapshot,
      purchaseCostSnapshotId: row.purchase_cost_snapshot_id,
      unitCost: row.unit_cost,
      currency: row.currency,
      lineAmount: row.line_amount,
    })),
    allocations: allocationRows.map((row) => ({
      id: row.id,
      fulfillmentRequirementId: row.fulfillment_requirement_id,
      salesOrderLineId: row.sales_order_line_id,
      salesOrderNumber: row.sales_order_number,
      materialId: row.material_id,
      materialCode: row.material_code,
      materialName: row.material_name,
      sourcingMode: row.sourcing_mode,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      directCustomerId: row.direct_customer_id,
      directCustomerName: row.direct_customer_name,
      directCustomerSiteId: row.direct_customer_site_id,
      directCustomerSiteName: row.direct_customer_site_name,
      purchaseOrderLineId: row.purchase_order_line_id,
      allocatedQuantity: row.allocated_quantity,
      supplierDeliveredQuantity: row.supplier_delivered_qty,
      customerAcceptedQuantity: row.customer_accepted_qty,
      customerBillableQuantity: row.customer_billable_qty,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol_snapshot,
      status: row.status,
      createdAt: row.created_at,
    })),
    evidence: evidenceRows.map((row) => ({
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      evidenceId: row.evidence_id,
      label: row.label,
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
      priceRuleId: row.price_rule_id,
      priceSnapshotId: row.price_snapshot_id,
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
      purchaseUomId: row.purchase_uom_id,
      purchaseUomSymbol: row.purchase_uom_symbol,
      isActive: row.is_active,
    })),
    uoms: uomRows.map((row) => ({
      id: row.id,
      symbol: row.symbol,
      name: row.name,
      isActive: row.is_active,
    })),
    warehouses: warehouseRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
    })),
  };
}

export async function executeSourcingCommand(
  sql: TransactionSql,
  principal: Principal,
  input: SourcingCommandInput,
): Promise<{ id: string; kind: SourcingCommandInput["kind"] }> {
  const actorId = principal.userId;
  switch (input.kind) {
    case "supplier.create": {
      await assertDatabasePermission(sql, actorId, "supplier.manage");
      const id = randomUUID();
      await sql`insert into public.suppliers (
        id, code, name_vi, tax_code, phone, email, address, created_by
      ) values (
        ${id}, ${input.code}, ${input.name}, ${input.taxCode}, ${input.phone},
        ${input.email}, ${input.address}, ${actorId}
      )`;
      return { id, kind: input.kind };
    }
    case "supplier-price.record": {
      await assertDatabasePermission(sql, actorId, "supplier_price.manage");
      const [supplier] = await sql<{ id: string }[]>`
        select id from public.suppliers where id = ${input.supplierId} and is_active`;
      if (!supplier) missing("Không tìm thấy nhà cung cấp đang hoạt động.");
      const [materialUom] = await sql<{ purchase_uom_id: string }[]>`
        select purchase_uom_id from public.materials
        where id = ${input.materialId} and is_active`;
      if (!materialUom) missing("Không tìm thấy vật liệu đang hoạt động.");
      if (materialUom.purchase_uom_id !== input.uomId) {
        conflict(
          "Đơn vị giá mua phải là đơn vị mua của vật liệu.",
          "SUPPLIER_PRICE_UOM_MISMATCH",
        );
      }
      await sql`update public.supplier_price_history
        set valid_to = (${input.validFrom}::date - interval '1 day')::date
        where supplier_id = ${input.supplierId}
          and material_id = ${input.materialId}
          and uom_id = ${input.uomId}
          and valid_to is null`;
      const [versionRow] = await sql<{ next_version: number }[]>`
        select coalesce(max(version), 0) + 1 as next_version
        from public.supplier_price_history
        where supplier_id = ${input.supplierId}
          and material_id = ${input.materialId}
          and uom_id = ${input.uomId}`;
      const id = randomUUID();
      await sql`insert into public.supplier_price_history (
        id, supplier_id, material_id, uom_id, unit_cost, currency,
        valid_from, version, change_reason, created_by
      ) values (
        ${id}, ${input.supplierId}, ${input.materialId}, ${input.uomId},
        ${input.unitCost}, ${input.currency}, ${input.validFrom},
        ${versionRow?.next_version ?? 1}, ${input.changeReason}, ${actorId}
      )`;
      return { id, kind: input.kind };
    }
    case "supply.allocate": {
      await assertDatabasePermission(sql, actorId, "sourcing.manage");
      validateSourcingRoute({
        mode: input.sourcingMode,
        supplierId: input.supplierId,
        warehouseId: input.warehouseId,
        directCustomerId: input.directCustomerId,
        directCustomerSiteId: input.directCustomerSiteId,
      });
      const [line] = await sql<
        {
          id: string;
          ordered_quantity: string;
          uom_id: string;
          uom_symbol_snapshot: string;
          customer_id: string;
          customer_site_id: string | null;
          requirement_id: string;
        }[]
      >`select line.id, line.ordered_quantity, line.uom_id,
          line.uom_symbol_snapshot, sales_order.customer_id,
          sales_order.customer_site_id, requirement.id as requirement_id
        from public.sales_order_lines as line
        join public.sales_orders as sales_order on sales_order.id = line.sales_order_id
        join public.fulfillment_requirements as requirement
          on requirement.sales_order_line_id = line.id
        where line.id = ${input.salesOrderLineId}
          and requirement.id = ${input.fulfillmentRequirementId}
          and sales_order.status in ('CONFIRMED', 'FULFILLING')
        for update of line, requirement`;
      if (!line) missing("Không tìm thấy dòng đơn bán sẵn sàng chia nguồn.");
      if (
        input.sourcingMode === "SUPPLIER_DIRECT" &&
        (input.directCustomerId !== line.customer_id ||
          input.directCustomerSiteId !== line.customer_site_id)
      ) {
        conflict(
          "Điểm giao thẳng phải khớp khách hàng và công trình của đơn bán.",
          "DROPSHIP_CUSTOMER_SITE_MISMATCH",
        );
      }
      const [sumRow] = await sql<{ allocated: string }[]>`
        select coalesce(sum(allocated_quantity), 0)::text as allocated
        from public.supply_allocations
        where sales_order_line_id = ${line.id} and status <> 'CANCELLED'`;
      if (
        Number(sumRow?.allocated ?? 0) + Number(input.quantity) >
        Number(line.ordered_quantity)
      ) {
        conflict(
          "Tổng số lượng chia nguồn vượt quá số lượng của dòng đơn bán.",
          "SUPPLY_ALLOCATION_EXCEEDS_ORDERED_QUANTITY",
        );
      }
      const id = randomUUID();
      await sql`insert into public.supply_allocations (
        id, fulfillment_requirement_id, sales_order_line_id, sourcing_mode,
        supplier_id, warehouse_id, direct_customer_id, direct_customer_site_id,
        allocated_quantity, uom_id, uom_symbol_snapshot, created_by
      ) values (
        ${id}, ${line.requirement_id}, ${line.id}, ${input.sourcingMode},
        ${input.supplierId}, ${input.warehouseId}, ${input.directCustomerId},
        ${input.directCustomerSiteId}, ${input.quantity}, ${line.uom_id},
        ${line.uom_symbol_snapshot}, ${actorId}
      )`;
      const projected = Number(sumRow?.allocated ?? 0) + Number(input.quantity);
      if (projected === Number(line.ordered_quantity)) {
        await sql`update public.fulfillment_requirements
          set status = 'ALLOCATED' where id = ${line.requirement_id}`;
      }
      return { id, kind: input.kind };
    }
    case "purchase-order.create": {
      await assertDatabasePermission(sql, actorId, "purchase_order.create");
      const [allocation] = await sql<
        {
          id: string;
          sales_order_line_id: string;
          sourcing_mode: SourcingMode;
          supplier_id: string | null;
          warehouse_id: string | null;
          direct_customer_id: string | null;
          direct_customer_site_id: string | null;
          allocated_quantity: string;
          uom_id: string;
          uom_symbol_snapshot: string;
          purchase_order_line_id: string | null;
          material_id: string;
          material_code_snapshot: string;
          material_name_snapshot: string;
          uom_snapshot: Record<string, unknown>;
        }[]
      >`select allocation.id, allocation.sales_order_line_id,
          allocation.sourcing_mode, allocation.supplier_id, allocation.warehouse_id,
          allocation.direct_customer_id, allocation.direct_customer_site_id,
          allocation.allocated_quantity, allocation.uom_id,
          allocation.uom_symbol_snapshot, allocation.purchase_order_line_id,
          line.material_id, line.material_code_snapshot, line.material_name_snapshot,
          line.uom_snapshot
        from public.supply_allocations as allocation
        join public.sales_order_lines as line on line.id = allocation.sales_order_line_id
        where allocation.id = ${input.supplyAllocationId}
        for update of allocation`;
      if (!allocation) missing("Không tìm thấy phần chia nguồn.");
      if (allocation.sourcing_mode === "WAREHOUSE") {
        conflict(
          "Nguồn kho nội bộ không tạo đơn mua.",
          "WAREHOUSE_SOURCE_HAS_NO_PURCHASE_ORDER",
        );
      }
      if (!allocation.supplier_id)
        conflict("Phần chia nguồn chưa có nhà cung cấp.");
      if (allocation.purchase_order_line_id) {
        conflict(
          "Phần chia nguồn này đã có đơn mua.",
          "ALLOCATION_ALREADY_ORDERED",
        );
      }
      const [price] = await sql<
        {
          id: string;
          unit_cost: string;
          currency: string;
          version: number;
          supplier_code: string;
          supplier_name: string;
        }[]
      >`select price.id, price.unit_cost, price.currency, price.version,
          supplier.code as supplier_code, supplier.name_vi as supplier_name
        from public.supplier_price_history as price
        join public.suppliers as supplier on supplier.id = price.supplier_id
        where price.supplier_id = ${allocation.supplier_id}
          and price.material_id = ${allocation.material_id}
          and price.uom_id = ${allocation.uom_id}
          and price.valid_from <= current_date
          and (price.valid_to is null or price.valid_to >= current_date)
          and supplier.is_active
        order by price.valid_from desc, price.version desc limit 1`;
      if (!price) {
        conflict(
          "Nhà cung cấp chưa có giá mua hiệu lực cho vật liệu này.",
          "NO_EFFECTIVE_SUPPLIER_PRICE",
        );
      }
      const snapshotId = randomUUID();
      await sql`insert into public.purchase_cost_snapshots (
        id, source_supplier_price_id, supplier_id, supplier_code_snapshot,
        supplier_name_snapshot, material_id, material_code_snapshot,
        material_name_snapshot, uom_id, uom_symbol_snapshot, unit_cost,
        currency, supplier_price_version, captured_by
      ) values (
        ${snapshotId}, ${price.id}, ${allocation.supplier_id},
        ${price.supplier_code}, ${price.supplier_name}, ${allocation.material_id},
        ${allocation.material_code_snapshot}, ${allocation.material_name_snapshot},
        ${allocation.uom_id}, ${allocation.uom_symbol_snapshot}, ${price.unit_cost},
        ${price.currency}, ${price.version}, ${actorId}
      )`;
      const [numberRow] = await sql<{ number: string }[]>`
        select 'PO-' || to_char(current_date, 'YYYY') || '-' ||
          lpad(nextval('public.purchase_order_number_seq')::text, 4, '0') as number`;
      const purchaseOrderId = randomUUID();
      const total = (
        Number(allocation.allocated_quantity) * Number(price.unit_cost)
      ).toFixed(2);
      await sql`insert into public.purchase_orders (
        id, purchase_order_number, supplier_id, supplier_code_snapshot,
        supplier_name_snapshot, currency, total_amount, delivery_mode,
        warehouse_id, direct_customer_id, direct_customer_site_id, created_by
      ) values (
        ${purchaseOrderId}, ${numberRow?.number ?? `PO-${randomUUID().slice(0, 8)}`},
        ${allocation.supplier_id}, ${price.supplier_code}, ${price.supplier_name},
        ${price.currency}, ${total}, ${allocation.sourcing_mode},
        ${allocation.warehouse_id}, ${allocation.direct_customer_id},
        ${allocation.direct_customer_site_id}, ${actorId}
      )`;
      const lineId = randomUUID();
      await sql`insert into public.purchase_order_lines (
        id, purchase_order_id, sales_order_line_id, supply_allocation_id,
        line_number, material_id, material_code_snapshot, material_name_snapshot,
        ordered_quantity, uom_id, uom_symbol_snapshot, uom_snapshot,
        purchase_cost_snapshot_id, unit_cost, currency, line_amount
      ) values (
        ${lineId}, ${purchaseOrderId}, ${allocation.sales_order_line_id},
        ${allocation.id}, 1, ${allocation.material_id},
        ${allocation.material_code_snapshot}, ${allocation.material_name_snapshot},
        ${allocation.allocated_quantity}, ${allocation.uom_id},
        ${allocation.uom_symbol_snapshot}, ${sql.json(allocation.uom_snapshot as JSONValue)},
        ${snapshotId}, ${price.unit_cost}, ${price.currency}, ${total}
      )`;
      await sql`update public.supply_allocations
        set purchase_order_line_id = ${lineId}, status = 'ORDERED'
        where id = ${allocation.id}`;
      return { id: purchaseOrderId, kind: input.kind };
    }
    case "purchase-order.confirm":
    case "purchase-order.send":
    case "purchase-order.acknowledge":
    case "purchase-order.cancel": {
      const permission: Permission =
        input.kind === "purchase-order.confirm"
          ? "purchase_order.confirm"
          : "purchase_order.send";
      await assertDatabasePermission(sql, actorId, permission);
      const nextStatus: PurchaseOrderStatus =
        input.kind === "purchase-order.confirm"
          ? "CONFIRMED"
          : input.kind === "purchase-order.send"
            ? "SENT"
            : input.kind === "purchase-order.acknowledge"
              ? "ACKNOWLEDGED"
              : "CANCELLED";
      const reason =
        input.kind === "purchase-order.cancel" ? input.reason : null;
      const [result] = await sql<{ purchase_order_id: string }[]>`
        select app_private.transition_purchase_order(
          ${input.purchaseOrderId}, ${nextStatus}, ${actorId}, ${reason}
        ) as purchase_order_id`;
      if (!result?.purchase_order_id) missing("Không tìm thấy đơn mua.");
      return { id: result.purchase_order_id, kind: input.kind };
    }
  }
}
