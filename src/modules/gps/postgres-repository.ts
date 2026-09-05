import { observeRead } from "@/lib/postgres/read-observability";
import "server-only";

import type { Sql, TransactionSql } from "postgres";

import { PlatformError } from "@/modules/platform/errors";
import type { Principal } from "@/modules/platform/types";
import type {
  FleetTrackingSnapshot,
  GpsLocationCommand,
  GpsFreshnessStatus,
  WorkerTrackingSnapshot,
} from "@/modules/gps/types";

async function databasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: "gps.location.submit" | "gps.location.read_fleet",
) {
  await observeRead("gps.permission", () => sql`select app_private.assert_actor_permission(${actorId}, ${permission})`);
}

function readFailed(): never {
  throw new PlatformError(
    "Chưa đọc được trạng thái vị trí. Dữ liệu Delivery vẫn giữ nguyên; hãy tải lại.",
    "GPS_READ_FAILED",
    503,
  );
}

export async function readWorkerTrackingSnapshot(
  sql: Sql | TransactionSql,
  principal: Principal,
): Promise<WorkerTrackingSnapshot> {
  await databasePermission(sql, principal.userId, "gps.location.submit");
  const rows = await observeRead("gps.readWorkerTrackingSnapshot.1", () => sql<{
    id: string;
    delivery_number: string;
    vehicle_name: string;
    status: "DISPATCHED" | "ARRIVED";
    recorded_at: string | null;
    freshness: GpsFreshnessStatus | null;
  }[]>`
    select delivery.id, delivery.delivery_number,
      vehicle.code || ' · ' || vehicle.plate_number as vehicle_name,
      delivery.status, location.recorded_at::text,
      case when location.recorded_at is null then null
           when location.recorded_at >= now() - interval '90 seconds' then 'LIVE'
           when location.recorded_at >= now() - interval '15 minutes' then 'STALE'
           else 'OFFLINE' end as freshness
    from public.deliveries delivery
    join public.delivery_assignments assignment on assignment.delivery_id = delivery.id
      and assignment.status in ('ASSIGNED', 'ACCEPTED')
    join public.vehicles vehicle on vehicle.id = assignment.vehicle_id
    left join public.current_vehicle_locations location on location.vehicle_id = assignment.vehicle_id
      and location.delivery_id = delivery.id and location.worker_user_id = ${principal.userId}
    where assignment.driver_user_id = ${principal.userId}
      and delivery.status in ('DISPATCHED', 'ARRIVED')
    order by delivery.dispatched_at desc nulls last, delivery.updated_at desc
    limit 2
  `);
  if (rows.length > 1) {
    return {
      activeDelivery: null,
      availabilityMessage: "Có nhiều chuyến đang hoạt động. Điều phối cần chốt lại chuyến hiện tại trước khi bật chia sẻ vị trí.",
    };
  }
  const row = rows[0];
  if (!row) {
    return {
      activeDelivery: null,
      availabilityMessage: "Chia sẻ vị trí chỉ bật khi bạn đang phụ trách một chuyến đã xuất phát hoặc đã đến nơi.",
    };
  }
  return {
    activeDelivery: {
      id: row.id,
      deliveryNumber: row.delivery_number,
      vehicleName: row.vehicle_name,
      status: row.status,
      lastRecordedAt: row.recorded_at,
      freshness: row.freshness ?? "UNKNOWN",
    },
    availabilityMessage: null,
  };
}

export async function readFleetTrackingSnapshot(
  sql: Sql | TransactionSql,
  principal: Principal,
): Promise<FleetTrackingSnapshot> {
  await databasePermission(sql, principal.userId, "gps.location.read_fleet");
  const rows = await observeRead("gps.readFleetTrackingSnapshot.1", () => sql<{
    vehicle_id: string;
    vehicle_code: string;
    plate_number: string;
    worker_name: string;
    delivery_id: string;
    delivery_number: string;
    next_destination: string;
    latitude: string;
    longitude: string;
    accuracy_m: string;
    speed_mps: string | null;
    recorded_at: string;
    freshness_status: GpsFreshnessStatus;
  }[]>`
    select vehicle_id, vehicle_code, plate_number, worker_name, delivery_id,
      delivery_number, next_destination, latitude, longitude, accuracy_m,
      speed_mps, recorded_at::text, freshness_status
    from public.active_vehicle_location_view
    order by recorded_at desc
  `);
  if (!rows) readFailed();
  return {
    locations: rows.map((row) => ({
      vehicleId: row.vehicle_id,
      vehicleName: `${row.vehicle_code} · ${row.plate_number}`,
      workerName: row.worker_name,
      deliveryId: row.delivery_id,
      deliveryNumber: row.delivery_number,
      nextDestination: row.next_destination,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracy_m,
      speedMps: row.speed_mps,
      recordedAt: row.recorded_at,
      freshness: row.freshness_status,
      etaMessage: row.freshness_status === "LIVE"
        ? "Đang cập nhật tuyến đường; giờ đến là ước tính vận hành, không phải cam kết."
        : "Vị trí chưa đủ mới để ước tính chính xác; điều phối cần xác nhận lại.",
    })),
    providerMessage: "Nếu bản đồ nền hoặc Realtime không khả dụng, điều phối vẫn dùng telemetry đã nhận; Delivery và phân công không bị thay đổi.",
  };
}

export async function executeGpsLocationCommand(
  sql: TransactionSql,
  principal: Principal,
  command: GpsLocationCommand,
) {
  const [row] = await sql<{ id: string }[]>`
    select app_private.record_active_delivery_location(
      ${command.latitude}, ${command.longitude}, ${command.accuracyM},
      ${command.speedMps}, ${command.headingDeg}, ${command.recordedAt},
      ${principal.userId}
    ) as id
  `;
  if (!row?.id) {
    throw new PlatformError("Hệ thống chưa ghi nhận vị trí. Delivery không bị thay đổi.", "GPS_RECORD_FAILED", 503);
  }
  return { id: row.id };
}
