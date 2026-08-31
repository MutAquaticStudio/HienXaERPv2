import "server-only";

import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";

import type { InventoryCommandInput } from "@/modules/inventory/commands";
import type { InventorySnapshot } from "@/modules/inventory/types";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";

interface PositionRow {
  warehouse_id: string;
  warehouse_code: string;
  warehouse_name: string;
  material_id: string;
  material_code: string;
  material_name: string;
  base_uom_id: string;
  base_uom_symbol: string;
  on_hand_quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  inventory_value: string;
  moving_average_cost: string;
  minimum_quantity: string | null;
  target_quantity: string | null;
  is_low_stock: boolean;
  updated_at: string;
}
interface MovementRow {
  id: string;
  movement_number: string;
  warehouse_name: string;
  material_name: string;
  base_uom_symbol: string;
  movement_type: "RECEIPT" | "ISSUE" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT";
  quantity_delta: string;
  unit_cost: string;
  inventory_value_delta: string;
  on_hand_after: string;
  moving_average_cost_after: string;
  reason: string;
  occurred_at: string;
}
interface ReservationRow {
  id: string;
  reservation_number: string;
  supply_allocation_id: string;
  sales_order_number: string;
  warehouse_name: string;
  material_name: string;
  document_quantity: string;
  document_uom_symbol_snapshot: string;
  reserved_quantity: string;
  base_uom_symbol_snapshot: string;
  status: "ACTIVE" | "CONSUMED" | "RELEASED" | "CANCELLED";
  created_at: string;
}
interface AllocationRow {
  id: string;
  sales_order_number: string;
  warehouse_name: string;
  material_name: string;
  allocated_quantity: string;
  uom_symbol_snapshot: string;
}
interface CountRow {
  id: string;
  count_number: string;
  warehouse_name: string;
  material_name: string;
  base_uom_symbol: string;
  system_quantity: string | null;
  counted_quantity: string;
  variance_quantity: string | null;
  status: "DRAFT" | "COUNTED" | "ADJUSTED" | "CANCELLED";
  counted_at: string;
}
interface MaterialRow {
  id: string;
  code: string;
  name: string;
  base_uom_id: string;
  base_uom_symbol: string;
}
interface WarehouseRow {
  id: string;
  code: string;
  name: string;
}
interface EvidenceRow {
  id: string;
  label: string;
  captured_at: string;
}

async function databasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: Permission,
) {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}

function missing(message: string): never {
  throw new PlatformError(message, "INVENTORY_RECORD_NOT_FOUND", 404);
}

async function materialSnapshot(sql: TransactionSql, materialId: string) {
  const [material] = await sql<
    {
      id: string;
      code: string;
      name: string;
      base_uom_id: string;
      base_symbol: string;
    }[]
  >`
    select material.id, material.code, material.name_vi as name,
      material.base_uom_id, uom.symbol as base_symbol
    from public.materials as material
    join public.uom_catalog as uom on uom.id = material.base_uom_id
    where material.id = ${materialId} and material.is_active = true
    for share of material, uom`;
  return material ?? missing("Không tìm thấy vật liệu đang hoạt động.");
}

async function conversionToBase(
  sql: TransactionSql,
  materialId: string,
  documentUomId: string,
  quantity: string,
  unitCost: string,
) {
  const material = await materialSnapshot(sql, materialId);
  if (material.base_uom_id === documentUomId) {
    return {
      material,
      baseQuantity: quantity,
      baseUnitCost: unitCost,
      documentSymbol: material.base_symbol,
      snapshot: {
        method: "BASE_UOM_IDENTITY",
        sourceQuantity: 1,
        targetQuantity: 1,
        version: 1,
      },
    };
  }
  const [row] = await sql<
    {
      id: string;
      source_quantity: string;
      target_quantity: string;
      method: string;
      rounding_scale: number;
      version: number;
      document_symbol: string;
    }[]
  >`
    select conversion.id, conversion.source_quantity, conversion.target_quantity,
      conversion.method, conversion.rounding_scale, conversion.version,
      document_uom.symbol as document_symbol
    from public.material_uom_conversions as conversion
    join public.uom_catalog as document_uom on document_uom.id = conversion.from_uom_id
    where conversion.material_id = ${materialId}
      and conversion.from_uom_id = ${documentUomId}
      and conversion.to_uom_id = ${material.base_uom_id}
      and conversion.is_current = true and conversion.valid_from <= now()
      and (conversion.valid_to is null or conversion.valid_to >= now())
    order by conversion.version desc limit 1`;
  if (!row)
    missing("Chưa có quy đổi hiện hành từ đơn vị nhập sang đơn vị tồn kho.");
  const factor = Number(row.target_quantity) / Number(row.source_quantity);
  const baseQuantity = (Number(quantity) * factor).toFixed(row.rounding_scale);
  const baseUnitCost = (Number(unitCost) / factor).toFixed(6);
  return {
    material,
    baseQuantity,
    baseUnitCost,
    documentSymbol: row.document_symbol,
    snapshot: {
      conversionId: row.id,
      method: row.method,
      sourceQuantity: row.source_quantity,
      targetQuantity: row.target_quantity,
      roundingScale: row.rounding_scale,
      version: row.version,
    },
  };
}

export async function readInventorySnapshot(
  sql: Sql,
  principal: Principal,
): Promise<InventorySnapshot> {
  assertPermission(principal, "inventory.read");
  await databasePermission(sql, principal.userId, "inventory.read");
  const [
    positionRows,
    movementRows,
    reservationRows,
    allocationRows,
    countRows,
    materialRows,
    warehouseRows,
    evidenceRows,
  ] = await Promise.all([
    sql<
      PositionRow[]
    >`select warehouse_id, warehouse_code, warehouse_name, material_id,
      material_code, material_name, base_uom_id, base_uom_symbol,
      on_hand_quantity, reserved_quantity, available_quantity, inventory_value,
      moving_average_cost, minimum_quantity, target_quantity, is_low_stock,
      updated_at::text from public.inventory_stock_status
      order by is_low_stock desc, warehouse_code, material_code limit 200`,
    sql<
      MovementRow[]
    >`select movement.id, movement.movement_number, warehouse.name_vi as warehouse_name,
      material.name_vi as material_name, uom.symbol as base_uom_symbol,
      movement.movement_type, movement.quantity_delta, movement.unit_cost,
      movement.inventory_value_delta, movement.on_hand_after,
      movement.moving_average_cost_after, movement.reason, movement.occurred_at::text
      from public.inventory_movements as movement
      join public.warehouses as warehouse on warehouse.id = movement.warehouse_id
      join public.materials as material on material.id = movement.material_id
      join public.uom_catalog as uom on uom.id = movement.base_uom_id
      order by movement.occurred_at desc limit 100`,
    sql<ReservationRow[]>`select reservation.id, reservation.reservation_number,
      reservation.supply_allocation_id, sales_order.sales_order_number,
      warehouse.name_vi as warehouse_name, material.name_vi as material_name,
      reservation.document_quantity, reservation.document_uom_symbol_snapshot,
      reservation.reserved_quantity, reservation.base_uom_symbol_snapshot,
      reservation.status, reservation.created_at::text
      from public.stock_reservations as reservation
      join public.sales_order_lines as line on line.id = reservation.sales_order_line_id
      join public.sales_orders as sales_order on sales_order.id = line.sales_order_id
      join public.warehouses as warehouse on warehouse.id = reservation.warehouse_id
      join public.materials as material on material.id = reservation.material_id
      order by reservation.created_at desc limit 100`,
    sql<AllocationRow[]>`select allocation.id, sales_order.sales_order_number,
      warehouse.name_vi as warehouse_name, line.material_name_snapshot as material_name,
      allocation.allocated_quantity, allocation.uom_symbol_snapshot
      from public.supply_allocations as allocation
      join public.sales_order_lines as line on line.id = allocation.sales_order_line_id
      join public.sales_orders as sales_order on sales_order.id = line.sales_order_id
      join public.warehouses as warehouse on warehouse.id = allocation.warehouse_id
      left join public.stock_reservations as reservation on reservation.supply_allocation_id = allocation.id
      where allocation.sourcing_mode = 'WAREHOUSE' and allocation.status <> 'CANCELLED'
        and reservation.id is null order by allocation.created_at desc limit 100`,
    sql<CountRow[]>`select stock_count.id, stock_count.count_number,
      warehouse.name_vi as warehouse_name, material.name_vi as material_name,
      uom.symbol as base_uom_symbol, line.system_quantity, line.counted_quantity,
      line.variance_quantity, stock_count.status, stock_count.counted_at::text
      from public.stock_counts as stock_count
      join public.stock_count_lines as line on line.stock_count_id = stock_count.id
      join public.warehouses as warehouse on warehouse.id = stock_count.warehouse_id
      join public.materials as material on material.id = line.material_id
      join public.uom_catalog as uom on uom.id = line.base_uom_id
      order by stock_count.counted_at desc limit 100`,
    sql<
      MaterialRow[]
    >`select material.id, material.code, material.name_vi as name,
      material.base_uom_id, uom.symbol as base_uom_symbol
      from public.materials as material join public.uom_catalog as uom on uom.id = material.base_uom_id
      where material.is_active = true order by material.code`,
    sql<
      WarehouseRow[]
    >`select id, code, name_vi as name from public.warehouses where is_active = true order by code`,
    sql<
      EvidenceRow[]
    >`select id, storage_path as label, created_at::text as captured_at
      from public.evidence order by created_at desc limit 100`,
  ]);
  return {
    positions: positionRows.map((row) => ({
      warehouseId: row.warehouse_id,
      warehouseCode: row.warehouse_code,
      warehouseName: row.warehouse_name,
      materialId: row.material_id,
      materialCode: row.material_code,
      materialName: row.material_name,
      baseUomId: row.base_uom_id,
      baseUomSymbol: row.base_uom_symbol,
      onHandQuantity: row.on_hand_quantity,
      reservedQuantity: row.reserved_quantity,
      availableQuantity: row.available_quantity,
      inventoryValue: row.inventory_value,
      movingAverageCost: row.moving_average_cost,
      minimumQuantity: row.minimum_quantity,
      targetQuantity: row.target_quantity,
      isLowStock: row.is_low_stock,
      updatedAt: row.updated_at,
    })),
    movements: movementRows.map((row) => ({
      id: row.id,
      movementNumber: row.movement_number,
      warehouseName: row.warehouse_name,
      materialName: row.material_name,
      baseUomSymbol: row.base_uom_symbol,
      movementType: row.movement_type,
      quantityDelta: row.quantity_delta,
      unitCost: row.unit_cost,
      inventoryValueDelta: row.inventory_value_delta,
      onHandAfter: row.on_hand_after,
      movingAverageCostAfter: row.moving_average_cost_after,
      reason: row.reason,
      occurredAt: row.occurred_at,
    })),
    reservations: reservationRows.map((row) => ({
      id: row.id,
      reservationNumber: row.reservation_number,
      supplyAllocationId: row.supply_allocation_id,
      salesOrderNumber: row.sales_order_number,
      warehouseName: row.warehouse_name,
      materialName: row.material_name,
      documentQuantity: row.document_quantity,
      documentUomSymbol: row.document_uom_symbol_snapshot,
      reservedQuantity: row.reserved_quantity,
      baseUomSymbol: row.base_uom_symbol_snapshot,
      status: row.status,
      createdAt: row.created_at,
    })),
    warehouseAllocations: allocationRows.map((row) => ({
      id: row.id,
      salesOrderNumber: row.sales_order_number,
      warehouseName: row.warehouse_name,
      materialName: row.material_name,
      allocatedQuantity: row.allocated_quantity,
      uomSymbol: row.uom_symbol_snapshot,
    })),
    stockCounts: countRows.map((row) => ({
      id: row.id,
      countNumber: row.count_number,
      warehouseName: row.warehouse_name,
      materialName: row.material_name,
      baseUomSymbol: row.base_uom_symbol,
      systemQuantity: row.system_quantity,
      countedQuantity: row.counted_quantity,
      varianceQuantity: row.variance_quantity,
      status: row.status,
      countedAt: row.counted_at,
    })),
    materials: materialRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      baseUomId: row.base_uom_id,
      baseUomSymbol: row.base_uom_symbol,
    })),
    warehouses: warehouseRows,
    evidence: evidenceRows.map((row) => ({
      id: row.id,
      label: row.label,
      capturedAt: row.captured_at,
    })),
  };
}

export async function executeInventoryCommand(
  sql: TransactionSql,
  principal: Principal,
  input: InventoryCommandInput,
) {
  const actorId = principal.userId;
  switch (input.kind) {
    case "inventory.reserve": {
      await databasePermission(sql, actorId, "inventory.reserve");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.reserve_stock(${input.supplyAllocationId}, ${actorId}) as id`;
      const result = row ?? missing("Không tạo được phiếu giữ hàng.");
      return { id: result.id, kind: input.kind };
    }
    case "reservation.release": {
      await databasePermission(sql, actorId, "inventory.reserve");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.release_stock_reservation(${input.reservationId}, ${input.reason}, ${actorId}) as id`;
      const result = row ?? missing("Không giải phóng được phiếu giữ hàng.");
      return { id: result.id, kind: input.kind };
    }
    case "receipt.confirm": {
      await databasePermission(sql, actorId, "inventory.receive");
      const receiptId = randomUUID();
      const lineId = randomUUID();
      const conversion = await conversionToBase(
        sql,
        input.materialId,
        input.documentUomId,
        input.documentQuantity,
        input.documentUnitCost,
      );
      await sql`insert into public.warehouse_receipts (id, receipt_number, warehouse_id, status, received_at, notes, created_by)
        values (${receiptId}, 'RCV-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.warehouse_receipt_number_seq')::text, 5, '0'), ${input.warehouseId}, 'DRAFT', now(), ${input.reason}, ${actorId})`;
      await sql`insert into public.warehouse_receipt_lines (id, warehouse_receipt_id, line_number, material_id, material_code_snapshot, material_name_snapshot, document_quantity, document_uom_id, document_uom_symbol_snapshot, base_quantity, base_uom_id, base_uom_symbol_snapshot, conversion_snapshot, document_unit_cost, base_unit_cost, currency, line_amount)
        values (${lineId}, ${receiptId}, 1, ${input.materialId}, ${conversion.material.code}, ${conversion.material.name}, ${input.documentQuantity}, ${input.documentUomId}, ${conversion.documentSymbol}, ${conversion.baseQuantity}, ${conversion.material.base_uom_id}, ${conversion.material.base_symbol}, ${sql.json(conversion.snapshot)}, ${input.documentUnitCost}, ${conversion.baseUnitCost}, 'VND', ${Number(input.documentQuantity) * Number(input.documentUnitCost)})`;
      await sql`select app_private.confirm_warehouse_receipt(${receiptId}, ${actorId})`;
      return { id: receiptId, kind: input.kind };
    }
    case "issue.confirm": {
      await databasePermission(sql, actorId, "inventory.issue");
      const issueId = randomUUID();
      const lineId = randomUUID();
      const material = await materialSnapshot(sql, input.materialId);
      await sql`insert into public.warehouse_issues (id, issue_number, warehouse_id, status, issued_at, reason, created_by)
        values (${issueId}, 'ISS-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.warehouse_issue_number_seq')::text, 5, '0'), ${input.warehouseId}, 'DRAFT', now(), ${input.reason}, ${actorId})`;
      await sql`insert into public.warehouse_issue_lines (id, warehouse_issue_id, line_number, reservation_id, material_id, material_code_snapshot, material_name_snapshot, base_quantity, base_uom_id, base_uom_symbol_snapshot)
        values (${lineId}, ${issueId}, 1, ${input.reservationId}, ${input.materialId}, ${material.code}, ${material.name}, ${input.baseQuantity}, ${material.base_uom_id}, ${material.base_symbol})`;
      await sql`select app_private.confirm_warehouse_issue(${issueId}, ${actorId})`;
      return { id: issueId, kind: input.kind };
    }
    case "stock-count.record": {
      await databasePermission(sql, actorId, "inventory.count");
      const countId = randomUUID();
      const material = await materialSnapshot(sql, input.materialId);
      await sql`insert into public.stock_counts (id, count_number, warehouse_id, status, count_reason, counted_at, created_by)
        values (${countId}, 'CNT-' || to_char(current_date, 'YYYY') || '-' || lpad(nextval('public.stock_count_number_seq')::text, 5, '0'), ${input.warehouseId}, 'DRAFT', ${input.reason}, now(), ${actorId})`;
      await sql`insert into public.stock_count_lines (stock_count_id, line_number, material_id, material_code_snapshot, material_name_snapshot, base_uom_id, base_uom_symbol_snapshot, counted_quantity)
        values (${countId}, 1, ${input.materialId}, ${material.code}, ${material.name}, ${material.base_uom_id}, ${material.base_symbol}, ${input.countedQuantity})`;
      await sql`select app_private.capture_stock_count(${countId}, ${actorId})`;
      return { id: countId, kind: input.kind };
    }
    case "stock-adjustment.approve": {
      await databasePermission(sql, actorId, "inventory.adjust");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.approve_stock_adjustment(${input.stockCountId}, ${input.reason}, ${input.evidenceId}, ${actorId}) as id`;
      const result = row ?? missing("Không tạo được phiếu điều chỉnh.");
      return { id: result.id, kind: input.kind };
    }
    case "reorder-policy.set": {
      await databasePermission(sql, actorId, "inventory.policy.manage");
      const material = await materialSnapshot(sql, input.materialId);
      const [row] = await sql<
        { id: string }[]
      >`insert into public.inventory_reorder_policies (warehouse_id, material_id, base_uom_id, minimum_quantity, target_quantity, change_reason, created_by, updated_by)
        values (${input.warehouseId}, ${input.materialId}, ${material.base_uom_id}, ${input.minimumQuantity}, ${input.targetQuantity}, ${input.reason}, ${actorId}, ${actorId})
        on conflict (warehouse_id, material_id) do update set minimum_quantity = excluded.minimum_quantity, target_quantity = excluded.target_quantity, change_reason = excluded.change_reason, updated_by = excluded.updated_by
        returning id`;
      const result = row ?? missing("Không lưu được ngưỡng tồn kho.");
      return { id: result.id, kind: input.kind };
    }
  }
}
