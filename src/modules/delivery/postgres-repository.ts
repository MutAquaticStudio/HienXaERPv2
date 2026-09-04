import "server-only";

import type { Sql, TransactionSql } from "postgres";
import type { createClient } from "@/lib/supabase/server";

import type { DeliveryCommandInput } from "@/modules/delivery/commands";
import type { DeliverySnapshot, DeliveryStatus } from "@/modules/delivery/types";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";

async function databasePermission(sql: Sql | TransactionSql, actorId: string, permission: Permission) {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}
function missing(message: string): never {
  throw new PlatformError(message, "DELIVERY_RECORD_NOT_FOUND", 404);
}

interface DeliveryRow {
  id: string;
  delivery_number: string;
  sales_order_number: string;
  customer_name_snapshot: string;
  sourcing_mode: "WAREHOUSE" | "SUPPLIER_DIRECT" | "SUPPLIER_TO_WAREHOUSE";
  pickup_address_snapshot: string;
  drop_address_snapshot: string;
  scheduled_date: string;
  status: DeliveryStatus;
  vehicle_name: string | null;
  driver_name: string | null;
  driver_user_id: string | null;
  proof_count: string;
}
interface LineRow {
  id: string;
  delivery_id: string;
  material_name_snapshot: string;
  material_code_snapshot: string;
  planned_quantity: string;
  uom_symbol_snapshot: string;
  actual_quantity: string | null;
  accepted_quantity: string | null;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface AssignedDeliveryRow {
  id: string;
  delivery_number: string;
  sales_order_id: string;
  customer_name_snapshot: string;
  sourcing_mode: DeliveryRow["sourcing_mode"];
  pickup_address_snapshot: string;
  drop_address_snapshot: string;
  scheduled_date: string;
  status: DeliveryStatus;
}

interface AssignedDeliveryAssignmentRow {
  delivery_id: string;
  vehicle_id: string;
  driver_user_id: string;
}

function deliveryReadFailed(): never {
  throw new PlatformError(
    "Chưa đọc được dữ liệu chuyến giao. Hãy thử tải lại.",
    "DELIVERY_READ_FAILED",
    503,
  );
}

export async function readDeliverySnapshot(sql: Sql, principal: Principal): Promise<DeliverySnapshot> {
  const driverOnly = !principal.permissions.includes("delivery.read");
  if (driverOnly) {
    assertPermission(principal, "delivery.update_assigned");
    await databasePermission(sql, principal.userId, "delivery.update_assigned");
  } else {
    assertPermission(principal, "delivery.read");
    await databasePermission(sql, principal.userId, "delivery.read");
  }

  const [deliveryRows, lineRows, planningRows, vehicleRows, driverRows, evidenceRows] = await Promise.all([
    sql<DeliveryRow[]>`
      select delivery.id, delivery.delivery_number, sales_order.sales_order_number,
        delivery.customer_name_snapshot, delivery.sourcing_mode,
        delivery.pickup_address_snapshot, delivery.drop_address_snapshot,
        delivery.scheduled_date::text, delivery.status,
        case when vehicle.id is null then null else vehicle.code || ' · ' || vehicle.plate_number end as vehicle_name,
        profile.display_name as driver_name, assignment.driver_user_id,
        (select count(*) from public.delivery_proofs proof where proof.delivery_id = delivery.id)::text as proof_count
      from public.deliveries delivery
      join public.sales_orders sales_order on sales_order.id = delivery.sales_order_id
      left join public.delivery_assignments assignment on assignment.delivery_id = delivery.id
        and assignment.status in ('ASSIGNED', 'ACCEPTED')
      left join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
      left join public.user_profiles profile on profile.user_id = assignment.driver_user_id
      where (${driverOnly} = false or assignment.driver_user_id = ${principal.userId})
      order by delivery.scheduled_date, delivery.created_at desc limit 200`,
    sql<LineRow[]>`
      select line.id, line.delivery_id, line.material_name_snapshot,
        line.material_code_snapshot, line.planned_quantity, line.uom_symbol_snapshot,
        actual.actual_quantity, actual.accepted_quantity
      from public.delivery_lines line
      left join public.delivery_actuals actual on actual.delivery_line_id = line.id
      join public.deliveries delivery on delivery.id = line.delivery_id
      left join public.delivery_assignments assignment on assignment.delivery_id = delivery.id
        and assignment.status in ('ASSIGNED', 'ACCEPTED')
      where (${driverOnly} = false or assignment.driver_user_id = ${principal.userId})
      order by line.delivery_id, line.line_number`,
    driverOnly
      ? Promise.resolve([])
      : sql<{
          id: string; sales_order_number: string; customer_name_snapshot: string;
          material_name_snapshot: string; allocated_quantity: string; uom_symbol_snapshot: string;
          sourcing_mode: "WAREHOUSE" | "SUPPLIER_DIRECT" | "SUPPLIER_TO_WAREHOUSE";
          pickup_address: string; drop_address: string;
        }[]>`
          select allocation.id, sales_order.sales_order_number,
            sales_order.customer_name_snapshot, line.material_name_snapshot,
            allocation.allocated_quantity, allocation.uom_symbol_snapshot,
            allocation.sourcing_mode,
            coalesce(warehouse.address, supplier.address, 'Điểm lấy chưa khai báo') as pickup_address,
            coalesce(site.address, 'Điểm giao chưa khai báo') as drop_address
          from public.supply_allocations allocation
          join public.sales_order_lines line on line.id = allocation.sales_order_line_id
          join public.sales_orders sales_order on sales_order.id = line.sales_order_id
          left join public.warehouses warehouse on warehouse.id = allocation.warehouse_id
          left join public.suppliers supplier on supplier.id = allocation.supplier_id
          left join public.customer_sites site on site.id = coalesce(allocation.direct_customer_site_id, sales_order.customer_site_id)
          left join public.delivery_lines delivery_line on delivery_line.supply_allocation_id = allocation.id
          left join public.stock_reservations reservation on reservation.supply_allocation_id = allocation.id
          where delivery_line.id is null and allocation.status <> 'CANCELLED'
            and (allocation.sourcing_mode <> 'WAREHOUSE' or reservation.status = 'ACTIVE')
          order by allocation.created_at desc limit 100`,
    driverOnly
      ? Promise.resolve([])
      : sql<{ id: string; code: string; plate_number: string; vehicle_type: string }[]>`
          select id, code, plate_number, vehicle_type from public.vehicles
          where is_active = true order by code`,
    driverOnly
      ? Promise.resolve([])
      : sql<{ user_id: string; display_name: string; employee_code: string }[]>`
          select profile.user_id, profile.display_name, operational.employee_code
          from public.user_profiles profile
          join public.employee_operational_profiles operational on operational.user_id = profile.user_id
          join public.user_roles user_role on user_role.user_id = profile.user_id
          join public.roles role on role.id = user_role.role_id and role.code = 'DRIVER'
          where profile.status = 'ACTIVE' and operational.is_active order by profile.display_name`,
    sql<{ id: string; storage_path: string }[]>`
      select id, storage_path from public.evidence
      where owner_user_id = ${principal.userId} or ${driverOnly} = false
      order by created_at desc limit 100`,
  ]);

  return {
    deliveries: deliveryRows.map((row) => ({
      id: row.id,
      deliveryNumber: row.delivery_number,
      salesOrderNumber: row.sales_order_number,
      customerName: row.customer_name_snapshot,
      sourcingMode: row.sourcing_mode,
      pickupAddress: row.pickup_address_snapshot,
      dropAddress: row.drop_address_snapshot,
      scheduledDate: row.scheduled_date,
      status: row.status,
      vehicleName: row.vehicle_name,
      driverName: row.driver_name,
      driverUserId: row.driver_user_id,
      proofCount: Number(row.proof_count),
      lines: lineRows.filter((line) => line.delivery_id === row.id).map((line) => ({
        id: line.id,
        materialName: line.material_name_snapshot,
        materialCode: line.material_code_snapshot,
        plannedQuantity: line.planned_quantity,
        uomSymbol: line.uom_symbol_snapshot,
        actualQuantity: line.actual_quantity,
        acceptedQuantity: line.accepted_quantity,
      })),
    })),
    planningOptions: planningRows.map((row) => ({
      id: row.id,
      salesOrderNumber: row.sales_order_number,
      customerName: row.customer_name_snapshot,
      materialName: row.material_name_snapshot,
      allocatedQuantity: row.allocated_quantity,
      uomSymbol: row.uom_symbol_snapshot,
      sourcingMode: row.sourcing_mode,
      pickupAddress: row.pickup_address,
      dropAddress: row.drop_address,
    })),
    vehicles: vehicleRows.map((row) => ({
      id: row.id,
      code: row.code,
      plateNumber: row.plate_number,
      vehicleType: row.vehicle_type,
    })),
    drivers: driverRows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      employeeCode: row.employee_code,
    })),
    evidence: evidenceRows.map((row) => ({ id: row.id, label: row.storage_path })),
  };
}

export async function readAssignedDeliverySnapshotFromSupabase(
  supabase: SupabaseServerClient,
  principal: Principal,
): Promise<DeliverySnapshot> {
  if (
    !principal.permissions.includes("delivery.read") &&
    !principal.permissions.includes("delivery.update_assigned")
  ) {
    assertPermission(principal, "delivery.update_assigned");
  }

  const assignmentResult = await supabase
    .from("delivery_assignments")
    .select("delivery_id, vehicle_id, driver_user_id")
    .eq("driver_user_id", principal.userId)
    .in("status", ["ASSIGNED", "ACCEPTED"]);
  if (assignmentResult.error) deliveryReadFailed();

  const assignments = (assignmentResult.data ?? []) as AssignedDeliveryAssignmentRow[];
  const deliveryIds = [...new Set(assignments.map((row) => row.delivery_id))];
  const evidenceQuery = supabase
    .from("evidence")
    .select("id, storage_path")
    .eq("owner_user_id", principal.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (deliveryIds.length === 0) {
    const evidenceResult = await evidenceQuery;
    if (evidenceResult.error) deliveryReadFailed();
    return {
      deliveries: [],
      planningOptions: [],
      vehicles: [],
      drivers: [],
      evidence: (evidenceResult.data ?? []).map((row) => ({
        id: row.id,
        label: row.storage_path,
      })),
    };
  }

  const [deliveryResult, lineResult, actualResult, proofResult, evidenceResult] =
    await Promise.all([
      supabase
        .from("deliveries")
        .select(
          "id, delivery_number, sales_order_id, customer_name_snapshot, sourcing_mode, pickup_address_snapshot, drop_address_snapshot, scheduled_date, status",
        )
        .in("id", deliveryIds)
        .order("scheduled_date", { ascending: true })
        .limit(200),
      supabase
        .from("delivery_lines")
        .select(
          "id, delivery_id, material_name_snapshot, material_code_snapshot, planned_quantity, uom_symbol_snapshot",
        )
        .in("delivery_id", deliveryIds)
        .order("line_number", { ascending: true }),
      supabase
        .from("delivery_actuals")
        .select("delivery_line_id, actual_quantity, accepted_quantity")
        .in("delivery_id", deliveryIds),
      supabase
        .from("delivery_proofs")
        .select("delivery_id")
        .in("delivery_id", deliveryIds),
      evidenceQuery,
    ]);
  if (
    [
      deliveryResult.error,
      lineResult.error,
      actualResult.error,
      proofResult.error,
      evidenceResult.error,
    ].some(Boolean)
  ) {
    deliveryReadFailed();
  }

  const deliveryRows = (deliveryResult.data ?? []) as AssignedDeliveryRow[];
  const salesOrderIds = [
    ...new Set(deliveryRows.map((row) => row.sales_order_id)),
  ];
  const vehicleIds = [...new Set(assignments.map((row) => row.vehicle_id))];
  const driverIds = [...new Set(assignments.map((row) => row.driver_user_id))];
  const [salesOrderResult, vehicleResult, driverResult] = await Promise.all([
    supabase
      .from("sales_orders")
      .select("id, sales_order_number")
      .in("id", salesOrderIds),
    supabase
      .from("vehicles")
      .select("id, code, plate_number")
      .in("id", vehicleIds),
    supabase
      .from("user_profiles")
      .select("user_id, display_name")
      .in("user_id", driverIds),
  ]);
  if (
    [salesOrderResult.error, vehicleResult.error, driverResult.error].some(
      Boolean,
    )
  ) {
    deliveryReadFailed();
  }

  const lines = (lineResult.data ?? []) as Array<
    Omit<LineRow, "actual_quantity" | "accepted_quantity">
  >;
  const actuals = (actualResult.data ?? []) as Array<{
    delivery_line_id: string;
    actual_quantity: string;
    accepted_quantity: string;
  }>;
  const proofCounts = new Map<string, number>();
  for (const proof of proofResult.data ?? []) {
    proofCounts.set(
      proof.delivery_id,
      (proofCounts.get(proof.delivery_id) ?? 0) + 1,
    );
  }
  const salesOrders = new Map(
    (salesOrderResult.data ?? []).map((row) => [row.id, row.sales_order_number]),
  );
  const vehicles = new Map(
    (vehicleResult.data ?? []).map((row) => [
      row.id,
      `${row.code} · ${row.plate_number}`,
    ]),
  );
  const drivers = new Map(
    (driverResult.data ?? []).map((row) => [row.user_id, row.display_name]),
  );

  return {
    deliveries: deliveryRows.map((row) => {
      const assignment = assignments.find(
        (item) => item.delivery_id === row.id,
      );
      return {
        id: row.id,
        deliveryNumber: row.delivery_number,
        salesOrderNumber: salesOrders.get(row.sales_order_id) ?? "—",
        customerName: row.customer_name_snapshot,
        sourcingMode: row.sourcing_mode,
        pickupAddress: row.pickup_address_snapshot,
        dropAddress: row.drop_address_snapshot,
        scheduledDate: row.scheduled_date,
        status: row.status,
        vehicleName: assignment
          ? (vehicles.get(assignment.vehicle_id) ?? null)
          : null,
        driverName: assignment
          ? (drivers.get(assignment.driver_user_id) ?? null)
          : null,
        driverUserId: assignment?.driver_user_id ?? null,
        proofCount: proofCounts.get(row.id) ?? 0,
        lines: lines
          .filter((line) => line.delivery_id === row.id)
          .map((line) => {
            const actual = actuals.find(
              (item) => item.delivery_line_id === line.id,
            );
            return {
              id: line.id,
              materialName: line.material_name_snapshot,
              materialCode: line.material_code_snapshot,
              plannedQuantity: line.planned_quantity,
              uomSymbol: line.uom_symbol_snapshot,
              actualQuantity: actual?.actual_quantity ?? null,
              acceptedQuantity: actual?.accepted_quantity ?? null,
            };
          }),
      };
    }),
    planningOptions: [],
    vehicles: [],
    drivers: [],
    evidence: (evidenceResult.data ?? []).map((row) => ({
      id: row.id,
      label: row.storage_path,
    })),
  };
}

export async function executeDeliveryCommand(
  sql: TransactionSql,
  principal: Principal,
  input: DeliveryCommandInput,
) {
  switch (input.kind) {
    case "delivery.plan": {
      await databasePermission(sql, principal.userId, "delivery.plan");
      const [source] = await sql<{
        allocation_id: string; sales_order_id: string; sales_order_line_id: string;
        customer_id: string; customer_code_snapshot: string; customer_name_snapshot: string;
        customer_site_id: string | null; customer_site_name_snapshot: string | null;
        sourcing_mode: "WAREHOUSE" | "SUPPLIER_DIRECT" | "SUPPLIER_TO_WAREHOUSE";
        warehouse_id: string | null; supplier_id: string | null; material_id: string;
        material_code_snapshot: string; material_name_snapshot: string;
        allocated_quantity: string; uom_id: string; uom_symbol_snapshot: string;
        reservation_id: string | null;
      }[]>`
        select allocation.id as allocation_id, sales_order.id as sales_order_id,
          line.id as sales_order_line_id, sales_order.customer_id,
          sales_order.customer_code_snapshot, sales_order.customer_name_snapshot,
          sales_order.customer_site_id, sales_order.customer_site_name_snapshot,
          allocation.sourcing_mode, allocation.warehouse_id, allocation.supplier_id,
          line.material_id, line.material_code_snapshot, line.material_name_snapshot,
          allocation.allocated_quantity, allocation.uom_id, allocation.uom_symbol_snapshot,
          reservation.id as reservation_id
        from public.supply_allocations allocation
        join public.sales_order_lines line on line.id = allocation.sales_order_line_id
        join public.sales_orders sales_order on sales_order.id = line.sales_order_id
        left join public.stock_reservations reservation on reservation.supply_allocation_id = allocation.id
        where allocation.id = ${input.supplyAllocationId} and allocation.status <> 'CANCELLED'
        for update of allocation`;
      if (!source) missing("Không tìm thấy phần chia nguồn có thể lập chuyến.");
      if (source.sourcing_mode === "WAREHOUSE" && !source.reservation_id) {
        throw new PlatformError("Chưa giữ đủ hàng trong kho cho chuyến này.", "ACTIVE_RESERVATION_REQUIRED", 409);
      }
      const [delivery] = await sql<{ id: string }[]>`
        insert into public.deliveries (
          delivery_number, sales_order_id, customer_id, customer_code_snapshot,
          customer_name_snapshot, customer_site_id, customer_site_name_snapshot,
          sourcing_mode, warehouse_id, supplier_id, pickup_address_snapshot,
          drop_address_snapshot, scheduled_date, created_by
        ) values (
          'DLV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_number_seq')::text, 6, '0'),
          ${source.sales_order_id}, ${source.customer_id}, ${source.customer_code_snapshot},
          ${source.customer_name_snapshot}, ${source.customer_site_id}, ${source.customer_site_name_snapshot},
          ${source.sourcing_mode}, ${source.warehouse_id}, ${source.supplier_id},
          ${input.pickupAddress}, ${input.dropAddress}, ${input.scheduledDate}, ${principal.userId}
        ) returning id`;
      if (!delivery) missing("Không tạo được chuyến giao.");
      await sql`
        insert into public.delivery_lines (
          delivery_id, line_number, supply_allocation_id, sales_order_line_id,
          stock_reservation_id, material_id, material_code_snapshot,
          material_name_snapshot, planned_quantity, uom_id, uom_symbol_snapshot
        ) values (
          ${delivery.id}, 1, ${source.allocation_id}, ${source.sales_order_line_id},
          ${source.reservation_id}, ${source.material_id}, ${source.material_code_snapshot},
          ${source.material_name_snapshot}, ${source.allocated_quantity}, ${source.uom_id},
          ${source.uom_symbol_snapshot}
        )`;
      return { id: delivery.id, kind: input.kind };
    }
    case "delivery.assign": {
      await databasePermission(sql, principal.userId, "delivery.assign");
      const [row] = await sql<{ id: string }[]>`
        select app_private.assign_delivery(
          ${input.deliveryId}, ${input.vehicleId}, ${input.driverUserId}, ${principal.userId}
        ) as id`;
      if (!row) missing("Không phân công được chuyến giao.");
      return { id: row.id, kind: input.kind };
    }
    case "delivery.progress": {
      const permission = input.nextStatus === "DISPATCHED" ? "delivery.dispatch" : "delivery.update_assigned";
      await databasePermission(sql, principal.userId, permission);
      const [row] = await sql<{ id: string }[]>`
        select app_private.transition_delivery(
          ${input.deliveryId}, ${input.nextStatus}::public.delivery_status,
          ${input.reason}, ${principal.userId}
        ) as id`;
      if (!row) missing("Không cập nhật được chuyến giao.");
      return { id: row.id, kind: input.kind };
    }
    case "delivery.proof": {
      await databasePermission(sql, principal.userId, "delivery.proof.create");
      const [row] = await sql<{ id: string }[]>`
        select app_private.record_delivery_proof(
          ${input.deliveryId}, ${input.proofType}::public.delivery_proof_type,
          ${input.evidenceId}, ${input.latitude}, ${input.longitude},
          ${input.receiverName}, '{}'::jsonb, ${principal.userId}
        ) as id`;
      if (!row) missing("Không lưu được bằng chứng giao hàng.");
      return { id: row.id, kind: input.kind };
    }
    case "delivery.confirm": {
      await databasePermission(sql, principal.userId, "delivery.confirm");
      const actuals = JSON.stringify([{ deliveryLineId: input.deliveryLineId, actualQuantity: input.actualQuantity, acceptedQuantity: input.acceptedQuantity, receiverName: input.receiverName, receivedAt: new Date().toISOString() }]);
      const [row] = await sql<{ id: string }[]>`
        select app_private.confirm_delivery(
          ${input.deliveryId}, ${actuals}::jsonb, ${input.reason}, ${principal.userId}
        ) as id`;
      if (!row) missing("Không xác nhận được chuyến giao.");
      return { id: row.id, kind: input.kind };
    }
  }
}
