import "server-only";

import type { Sql, TransactionSql } from "postgres";

import type {
  SaveMasterDataInput,
  ToggleMasterDataInput,
} from "@/modules/master-data/commands";
import type {
  ConversionMethod,
  MasterDataSnapshot,
  UomDimension,
  WorkerSkillLevel,
} from "@/modules/master-data/types";
import { assertPermission } from "@/modules/platform/authorization";
import type { Principal } from "@/modules/platform/types";

interface BasicRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

async function assertDatabasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: "master_data.read" | "master_data.manage",
): Promise<void> {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}

export async function readMasterData(
  sql: Sql,
  principal: Principal,
): Promise<MasterDataSnapshot> {
  assertPermission(principal, "master_data.read");
  await assertDatabasePermission(sql, principal.userId, "master_data.read");

  const materialGroupRows = await sql<
    (BasicRow & { description: string | null })[]
  >`
    select id, code, name_vi as name, description, is_active
    from public.material_groups order by is_active desc, code
  `;
  const uomRows = await sql<
    (BasicRow & {
      symbol: string;
      dimension: UomDimension;
      decimal_scale: number;
    })[]
  >`
    select id, code, name_vi as name, symbol, dimension, decimal_scale, is_active
    from public.uom_catalog order by is_active desc, dimension, code
  `;
  const materialRows = await sql<
    (BasicRow & {
      group_id: string;
      group_name: string;
      base_uom_id: string;
      base_uom_symbol: string;
      purchase_uom_id: string;
      purchase_uom_symbol: string;
      sales_uom_id: string;
      sales_uom_symbol: string;
    })[]
  >`
    select
      material.id,
      material.code,
      material.name_vi as name,
      material.is_active,
      material.material_group_id as group_id,
      material_group.name_vi as group_name,
      material.base_uom_id,
      base_uom.symbol as base_uom_symbol,
      material.purchase_uom_id,
      purchase_uom.symbol as purchase_uom_symbol,
      material.sales_uom_id,
      sales_uom.symbol as sales_uom_symbol
    from public.materials as material
    join public.material_groups as material_group on material_group.id = material.material_group_id
    join public.uom_catalog as base_uom on base_uom.id = material.base_uom_id
    join public.uom_catalog as purchase_uom on purchase_uom.id = material.purchase_uom_id
    join public.uom_catalog as sales_uom on sales_uom.id = material.sales_uom_id
    order by material.is_active desc, material.code
  `;
  const conversionRows = await sql<
    {
      id: string;
      material_id: string;
      material_name: string;
      from_uom_id: string;
      from_uom_symbol: string;
      to_uom_id: string;
      to_uom_symbol: string;
      source_quantity: string;
      target_quantity: string;
      method: ConversionMethod;
      rounding_scale: number;
      version: number;
      is_current: boolean;
    }[]
  >`
    select
      conversion.id,
      conversion.material_id,
      material.name_vi as material_name,
      conversion.from_uom_id,
      source_uom.symbol as from_uom_symbol,
      conversion.to_uom_id,
      target_uom.symbol as to_uom_symbol,
      conversion.source_quantity,
      conversion.target_quantity,
      conversion.method,
      conversion.rounding_scale,
      conversion.version,
      conversion.is_current
    from public.material_uom_conversions as conversion
    join public.materials as material on material.id = conversion.material_id
    join public.uom_catalog as source_uom on source_uom.id = conversion.from_uom_id
    join public.uom_catalog as target_uom on target_uom.id = conversion.to_uom_id
    order by conversion.is_current desc, material.code, source_uom.code, conversion.version desc
  `;
  const warehouseRows = await sql<(BasicRow & { address: string | null })[]>`
    select id, code, name_vi as name, address, is_active
    from public.warehouses order by is_active desc, code
  `;
  const vehicleRows = await sql<
    (BasicRow & {
      plate_number: string;
      vehicle_type: string;
      home_warehouse_id: string | null;
      home_warehouse_name: string | null;
      max_payload_kg: string | null;
      max_volume_m3: string | null;
    })[]
  >`
    select
      vehicle.id,
      vehicle.code,
      vehicle.code as name,
      vehicle.plate_number,
      vehicle.vehicle_type,
      vehicle.home_warehouse_id,
      warehouse.name_vi as home_warehouse_name,
      vehicle.max_payload_kg,
      vehicle.max_volume_m3,
      vehicle.is_active
    from public.vehicles as vehicle
    left join public.warehouses as warehouse on warehouse.id = vehicle.home_warehouse_id
    order by vehicle.is_active desc, vehicle.code
  `;
  const loadProfileRows = await sql<
    {
      id: string;
      vehicle_id: string;
      vehicle_name: string;
      target_name: string;
      planned_quantity: string;
      uom_id: string;
      uom_symbol: string;
      is_active: boolean;
      profile_kind: "PLANNING_CAPACITY";
    }[]
  >`
    select
      profile.id,
      profile.vehicle_id,
      vehicle.code as vehicle_name,
      coalesce(material.name_vi, material_group.name_vi) as target_name,
      profile.planned_quantity,
      profile.uom_id,
      uom.symbol as uom_symbol,
      profile.is_active,
      profile.profile_kind
    from public.vehicle_load_profiles as profile
    join public.vehicles as vehicle on vehicle.id = profile.vehicle_id
    join public.uom_catalog as uom on uom.id = profile.uom_id
    left join public.materials as material on material.id = profile.material_id
    left join public.material_groups as material_group on material_group.id = profile.material_group_id
    order by profile.is_active desc, vehicle.code, target_name
  `;
  const skillRows = await sql<BasicRow[]>`
    select id, code, name_vi as name, is_active
    from public.worker_skill_catalog order by is_active desc, code
  `;
  const employeeRows = await sql<
    { user_id: string; display_name: string; status: string }[]
  >`
    select user_id, display_name, status::text
    from public.user_profiles order by display_name
  `;
  const employeeProfileRows = await sql<
    {
      user_id: string;
      display_name: string;
      employee_code: string;
      home_warehouse_id: string | null;
      home_warehouse_name: string | null;
      job_title: string | null;
      is_active: boolean;
    }[]
  >`
    select
      profile.user_id,
      user_profile.display_name,
      profile.employee_code,
      profile.home_warehouse_id,
      warehouse.name_vi as home_warehouse_name,
      profile.job_title,
      profile.is_active
    from public.employee_operational_profiles as profile
    join public.user_profiles as user_profile on user_profile.user_id = profile.user_id
    left join public.warehouses as warehouse on warehouse.id = profile.home_warehouse_id
    order by profile.is_active desc, profile.employee_code
  `;
  const assignmentRows = await sql<
    {
      user_id: string;
      display_name: string;
      skill_id: string;
      skill_name: string;
      level: WorkerSkillLevel;
      is_active: boolean;
    }[]
  >`
    select
      assignment.user_id,
      profile.display_name,
      assignment.skill_id,
      skill.name_vi as skill_name,
      assignment.level,
      assignment.is_active
    from public.worker_skills as assignment
    join public.user_profiles as profile on profile.user_id = assignment.user_id
    join public.worker_skill_catalog as skill on skill.id = assignment.skill_id
    order by assignment.is_active desc, profile.display_name, skill.code
  `;

  return {
    materialGroups: materialGroupRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
    })),
    uoms: uomRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      symbol: row.symbol,
      dimension: row.dimension,
      decimalScale: row.decimal_scale,
      isActive: row.is_active,
    })),
    materials: materialRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      groupId: row.group_id,
      groupName: row.group_name,
      baseUomId: row.base_uom_id,
      baseUomSymbol: row.base_uom_symbol,
      purchaseUomId: row.purchase_uom_id,
      purchaseUomSymbol: row.purchase_uom_symbol,
      salesUomId: row.sales_uom_id,
      salesUomSymbol: row.sales_uom_symbol,
      isActive: row.is_active,
    })),
    conversions: conversionRows.map((row) => ({
      id: row.id,
      materialId: row.material_id,
      materialName: row.material_name,
      fromUomId: row.from_uom_id,
      fromUomSymbol: row.from_uom_symbol,
      toUomId: row.to_uom_id,
      toUomSymbol: row.to_uom_symbol,
      sourceQuantity: row.source_quantity,
      targetQuantity: row.target_quantity,
      method: row.method,
      roundingScale: row.rounding_scale,
      version: row.version,
      isCurrent: row.is_current,
    })),
    warehouses: warehouseRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      isActive: row.is_active,
    })),
    vehicles: vehicleRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      plateNumber: row.plate_number,
      vehicleType: row.vehicle_type,
      homeWarehouseId: row.home_warehouse_id,
      homeWarehouseName: row.home_warehouse_name,
      maxPayloadKg: row.max_payload_kg,
      maxVolumeM3: row.max_volume_m3,
      isActive: row.is_active,
    })),
    vehicleLoadProfiles: loadProfileRows.map((row) => ({
      id: row.id,
      vehicleId: row.vehicle_id,
      vehicleName: row.vehicle_name,
      targetName: row.target_name,
      plannedQuantity: row.planned_quantity,
      uomId: row.uom_id,
      uomSymbol: row.uom_symbol,
      isActive: row.is_active,
      profileKind: row.profile_kind,
    })),
    workerSkills: skillRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
    })),
    employees: employeeRows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      status: row.status,
    })),
    employeeProfiles: employeeProfileRows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      employeeCode: row.employee_code,
      homeWarehouseId: row.home_warehouse_id,
      homeWarehouseName: row.home_warehouse_name,
      jobTitle: row.job_title,
      isActive: row.is_active,
    })),
    workerSkillAssignments: assignmentRows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      skillId: row.skill_id,
      skillName: row.skill_name,
      level: row.level,
      isActive: row.is_active,
    })),
  };
}

export async function saveMasterDataRecord(
  sql: TransactionSql,
  actorId: string,
  input: SaveMasterDataInput,
): Promise<{ id: string; kind: SaveMasterDataInput["kind"] }> {
  await assertDatabasePermission(sql, actorId, "master_data.manage");

  switch (input.kind) {
    case "material-group": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.material_groups (code, name_vi, description)
        values (${input.code}, ${input.name}, ${input.description})
        on conflict (code) do update set
          name_vi = excluded.name_vi,
          description = excluded.description,
          is_active = true,
          deactivated_at = null
        returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "uom": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.uom_catalog (
          code, symbol, name_vi, dimension, decimal_scale
        ) values (
          ${input.code}, ${input.symbol}, ${input.name}, ${input.dimension}, ${input.decimalScale}
        )
        on conflict (code) do update set
          symbol = excluded.symbol,
          name_vi = excluded.name_vi,
          dimension = excluded.dimension,
          decimal_scale = excluded.decimal_scale,
          is_active = true,
          deactivated_at = null
        returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "material": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.materials (
          material_group_id, code, name_vi, base_uom_id,
          purchase_uom_id, sales_uom_id
        ) values (
          ${input.groupId}, ${input.code}, ${input.name}, ${input.baseUomId},
          ${input.purchaseUomId}, ${input.salesUomId}
        )
        on conflict (code) do update set
          material_group_id = excluded.material_group_id,
          name_vi = excluded.name_vi,
          base_uom_id = excluded.base_uom_id,
          purchase_uom_id = excluded.purchase_uom_id,
          sales_uom_id = excluded.sales_uom_id,
          is_active = true,
          deactivated_at = null
        returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "conversion": {
      const [material] = await sql<{ base_uom_id: string }[]>`
        select base_uom_id from public.materials
        where id = ${input.materialId} for update
      `;
      if (!material) throw new Error("Vật liệu không tồn tại.");
      const [latest] = await sql<
        { id: string; version: number; is_current: boolean }[]
      >`
        select id, version, is_current
        from public.material_uom_conversions
        where material_id = ${input.materialId}
          and from_uom_id = ${input.fromUomId}
        order by version desc limit 1 for update
      `;
      if (latest?.is_current) {
        await sql`
          update public.material_uom_conversions
          set is_current = false, valid_to = now()
          where id = ${latest.id}
        `;
      }
      const [row] = await sql<{ id: string }[]>`
        insert into public.material_uom_conversions (
          material_id, from_uom_id, to_uom_id, source_quantity,
          target_quantity, method, rounding_scale, version, created_by
        ) values (
          ${input.materialId}, ${input.fromUomId}, ${material.base_uom_id},
          ${input.sourceQuantity}, ${input.targetQuantity}, ${input.method},
          ${input.roundingScale}, ${(latest?.version ?? 0) + 1}, ${actorId}
        ) returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "warehouse": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.warehouses (code, name_vi, address)
        values (${input.code}, ${input.name}, ${input.address})
        on conflict (code) do update set
          name_vi = excluded.name_vi,
          address = excluded.address,
          is_active = true,
          deactivated_at = null
        returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "vehicle": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.vehicles (
          code, plate_number, vehicle_type, home_warehouse_id,
          max_payload_kg, max_volume_m3
        ) values (
          ${input.code}, ${input.plateNumber}, ${input.vehicleType},
          ${input.homeWarehouseId}, ${input.maxPayloadKg}, ${input.maxVolumeM3}
        )
        on conflict (code) do update set
          plate_number = excluded.plate_number,
          vehicle_type = excluded.vehicle_type,
          home_warehouse_id = excluded.home_warehouse_id,
          max_payload_kg = excluded.max_payload_kg,
          max_volume_m3 = excluded.max_volume_m3,
          is_active = true,
          deactivated_at = null
        returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "vehicle-load-profile": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.vehicle_load_profiles (
          vehicle_id, material_id, material_group_id, planned_quantity,
          uom_id, notes
        ) values (
          ${input.vehicleId}, ${input.materialId}, ${input.materialGroupId},
          ${input.plannedQuantity}, ${input.uomId}, ${input.notes}
        ) returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "employee-profile": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.employee_operational_profiles (
          user_id, employee_code, home_warehouse_id, job_title
        ) values (
          ${input.userId}, ${input.employeeCode}, ${input.homeWarehouseId}, ${input.jobTitle}
        )
        on conflict (user_id) do update set
          employee_code = excluded.employee_code,
          home_warehouse_id = excluded.home_warehouse_id,
          job_title = excluded.job_title,
          is_active = true,
          deactivated_at = null
        returning user_id as id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "worker-skill": {
      const [row] = await sql<{ id: string }[]>`
        insert into public.worker_skill_catalog (code, name_vi, description)
        values (${input.code}, ${input.name}, ${input.description})
        on conflict (code) do update set
          name_vi = excluded.name_vi,
          description = excluded.description,
          is_active = true,
          deactivated_at = null
        returning id
      `;
      return { id: row!.id, kind: input.kind };
    }
    case "worker-skill-assignment": {
      await sql`
        insert into public.worker_skills (user_id, skill_id, level)
        values (${input.userId}, ${input.skillId}, ${input.level})
        on conflict (user_id, skill_id) do update set
          level = excluded.level,
          is_active = true,
          deactivated_at = null
      `;
      return {
        id: `${input.userId}:${input.skillId}`,
        kind: input.kind,
      };
    }
  }
}

export async function toggleMasterDataRecord(
  sql: TransactionSql,
  actorId: string,
  input: ToggleMasterDataInput,
): Promise<{
  id: string;
  kind: ToggleMasterDataInput["kind"];
  isActive: boolean;
}> {
  await assertDatabasePermission(sql, actorId, "master_data.manage");
  const active = input.isActive;
  switch (input.kind) {
    case "material-group":
      await sql`update public.material_groups set is_active = ${active} where id = ${input.id}`;
      break;
    case "uom":
      await sql`update public.uom_catalog set is_active = ${active} where id = ${input.id}`;
      break;
    case "material":
      await sql`update public.materials set is_active = ${active} where id = ${input.id}`;
      break;
    case "warehouse":
      await sql`update public.warehouses set is_active = ${active} where id = ${input.id}`;
      break;
    case "vehicle":
      await sql`update public.vehicles set is_active = ${active} where id = ${input.id}`;
      break;
    case "vehicle-load-profile":
      await sql`update public.vehicle_load_profiles set is_active = ${active} where id = ${input.id}`;
      break;
    case "employee-profile":
      await sql`update public.employee_operational_profiles set is_active = ${active} where user_id = ${input.id}`;
      break;
    case "worker-skill":
      await sql`update public.worker_skill_catalog set is_active = ${active} where id = ${input.id}`;
      break;
  }
  return { id: input.id, kind: input.kind, isActive: active };
}

export async function captureConversionSnapshot(
  sql: TransactionSql,
  actorId: string,
  conversionId: string,
  transactionRef: string,
): Promise<string> {
  await assertDatabasePermission(sql, actorId, "master_data.read");
  const [row] = await sql<{ id: string }[]>`
    insert into public.uom_conversion_snapshots (
      source_conversion_id, material_id, material_code, material_name_vi,
      from_uom_code, from_uom_symbol, to_uom_code, to_uom_symbol,
      source_quantity, target_quantity, method, rounding_scale,
      conversion_version, transaction_ref, captured_by
    )
    select
      conversion.id, material.id, material.code, material.name_vi,
      source_uom.code, source_uom.symbol, target_uom.code, target_uom.symbol,
      conversion.source_quantity, conversion.target_quantity,
      conversion.method, conversion.rounding_scale, conversion.version,
      ${transactionRef}, ${actorId}
    from public.material_uom_conversions as conversion
    join public.materials as material on material.id = conversion.material_id
    join public.uom_catalog as source_uom on source_uom.id = conversion.from_uom_id
    join public.uom_catalog as target_uom on target_uom.id = conversion.to_uom_id
    where conversion.id = ${conversionId}
    returning id
  `;
  if (!row) throw new Error("Không tìm thấy version quy đổi để chụp snapshot.");
  return row.id;
}
