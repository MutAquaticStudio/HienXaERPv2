"use server";
import { userFacingError } from "@/lib/core/errors";


import { revalidatePath } from "next/cache";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { recommendRoute } from "@/modules/routing/provider";
import { effectiveWindow, overlappingIndexes, parseStopMinutes, stopWindows } from "@/modules/routing/stop-schedule";

export type RouteActionState = {
  status: "idle" | "success" | "error";
  message: string;
  planId?: string;
};

const initialError = (message: string): RouteActionState => ({ status: "error", message: userFacingError(message, "Không thể cập nhật lộ trình. Vui lòng thử lại.") });

function parseDeliveryIds(value: FormDataEntryValue | null) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === "string"))].slice(0, 50);
  } catch {
    return [];
  }
}

export async function createRoutePlanAction(_previous: RouteActionState, formData: FormData): Promise<RouteActionState> {
  const access = await requireInternalPermission("delivery.assign");
  const deliveryIds = parseDeliveryIds(formData.get("delivery_ids"));
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  const driverEmployeeId = String(formData.get("driver_employee_id") ?? "");
  const departureAt = String(formData.get("departure_at_iso") ?? "");
  const operationId = String(formData.get("operation_id") ?? "");
  const stopMinutes = parseStopMinutes(formData.get("stop_minutes"));
  if (!deliveryIds.length) return initialError("Chọn ít nhất một chuyến giao.");
  if (!vehicleId || !driverEmployeeId || !departureAt || Number.isNaN(Date.parse(departureAt)) || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    return initialError("Chọn xe, tài xế và giờ khởi hành hợp lệ.");
  }
  if (stopMinutes === null) return initialError("Nhập thời gian mỗi điểm dừng từ 10 đến 480 phút.");

  const supabase = await createServerSupabase();
  const [{ data: deliveries, error: deliveryError }, { data: vehicle, error: vehicleError }] = await Promise.all([
    supabase
      .from("deliveries")
      .select("id,delivery_number,version,execution_state,site_id,delivery_address_snapshot,scheduled_at,scheduled_end_at")
      .eq("branch_id", access.branchId)
      .in("id", deliveryIds)
      .in("execution_state", ["PLANNED", "ASSIGNED"])
      .limit(50),
    supabase
      .from("vehicles")
      .select("id,capacity_quantity,capacity_uom_id")
      .eq("branch_id", access.branchId)
      .eq("id", vehicleId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (deliveryError) return initialError(deliveryError.message);
  if (vehicleError || !vehicle) return initialError("Xe không còn khả dụng trong chi nhánh.");
  if ((deliveries ?? []).length !== deliveryIds.length) return initialError("Một chuyến giao đã đổi trạng thái hoặc không còn khả dụng.");

  const siteIds = [...new Set((deliveries ?? []).map((row) => String(row.site_id)))];
  const [{ data: sites, error: siteError }, { data: lines, error: lineError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from("customer_sites").select("id,latitude,longitude,receiving_window").in("id", siteIds).limit(50),
    supabase.from("delivery_lines").select("delivery_id,planned_base_quantity,base_uom_id").in("delivery_id", deliveryIds).limit(500),
    supabase.from("delivery_assignments").select("delivery_id,assignment_version").in("delivery_id", deliveryIds).is("superseded_at", null).limit(50),
  ]);
  if (siteError || lineError || assignmentError) return initialError(siteError?.message ?? lineError?.message ?? assignmentError?.message ?? "Không tải được dữ liệu lộ trình.");

  const deliveryById = new Map((deliveries ?? []).map((row) => [String(row.id), row]));
  const siteById = new Map((sites ?? []).map((row) => [String(row.id), row]));
  const assignmentVersionByDelivery = new Map((assignments ?? []).map((row) => [String(row.delivery_id), Number(row.assignment_version)]));
  const linesByDelivery = new Map<string, Array<{ planned_base_quantity: number | string; base_uom_id: string }>>();
  for (const line of lines ?? []) {
    const key = String(line.delivery_id);
    linesByDelivery.set(key, [...(linesByDelivery.get(key) ?? []), line]);
  }
  const inputStops = deliveryIds.map((deliveryId) => {
    const delivery = deliveryById.get(deliveryId)!;
    const site = siteById.get(String(delivery.site_id));
    return {
      deliveryId,
      latitude: site?.latitude === null || site?.latitude === undefined ? null : Number(site.latitude),
      longitude: site?.longitude === null || site?.longitude === undefined ? null : Number(site.longitude),
    };
  });
  const recommendation = await recommendRoute(inputStops);
  const capacity = vehicle.capacity_quantity === null ? null : Number(vehicle.capacity_quantity);
  const capacityUomId = vehicle.capacity_uom_id ? String(vehicle.capacity_uom_id) : null;
  const allLines = [...linesByDelivery.values()].flat();
  const sameUom = !!capacityUomId && allLines.length > 0 && allLines.every((line) => String(line.base_uom_id) === capacityUomId);
  const totalQuantity = sameUom ? allLines.reduce((sum, line) => sum + Number(line.planned_base_quantity), 0) : null;
  // Expected window per stop in the final order; deliveries with a schedule keep theirs when the route is applied.
  const windows = stopWindows(new Date(departureAt).toISOString(), stopMinutes, recommendation.orderedDeliveryIds.length);
  const overlaps = overlappingIndexes(recommendation.orderedDeliveryIds.map((deliveryId, index) => {
    const delivery = deliveryById.get(deliveryId)!;
    return effectiveWindow(delivery.scheduled_at ?? null, delivery.scheduled_end_at ?? null, windows[index] ?? null);
  }));
  const stops = recommendation.orderedDeliveryIds.map((deliveryId, index) => {
    const delivery = deliveryById.get(deliveryId)!;
    const site = siteById.get(String(delivery.site_id));
    let capacityWarning: string | null = null;
    if (capacity === null || !capacityUomId) {
      capacityWarning = "Xe chưa có tải trọng và đơn vị để đối chiếu.";
    } else if (totalQuantity === null) {
      capacityWarning = "Đơn vị hàng không đồng nhất với tải trọng xe; cần kiểm tra thủ công.";
    } else if (totalQuantity > capacity) {
      capacityWarning = "Tổng hàng toàn tuyến vượt tải trọng xe; kiểm tra lượng nhận và giao từng chặng trước khi áp dụng.";
    }
    return {
      delivery_id: deliveryId,
      stop_order: index + 1,
      expected_delivery_version: Number(delivery.version),
      expected_assignment_version: assignmentVersionByDelivery.get(deliveryId) ?? 0,
      latitude: site?.latitude ?? null,
      longitude: site?.longitude ?? null,
      address_snapshot: delivery.delivery_address_snapshot,
      time_window_snapshot: site?.receiving_window ?? null,
      capacity_warning: capacityWarning,
      time_window_warning: overlaps.has(index)
        ? "Lịch chồng với điểm khác trên cùng xe; áp dụng sẽ bị từ chối. Chốt lại giờ trên phiếu giao hoặc đổi giờ đi."
        : site?.receiving_window
          ? "Chưa đối chiếu giờ đến dự kiến với khung giờ nhận hàng; xác nhận thủ công."
          : "Công trình chưa có khung giờ nhận hàng.",
      planned_start_at: windows[index]?.start ?? null,
      planned_end_at: windows[index]?.end ?? null,
    };
  });

  const { data, error } = await supabase.rpc("create_route_plan", {
    target_branch_id: access.branchId,
    target_departure_at: new Date(departureAt).toISOString(),
    target_vehicle_id: vehicleId,
    target_driver_employee_id: driverEmployeeId,
    target_provider_state: recommendation.state,
    target_provider_distance_meters: recommendation.distanceMeters,
    target_provider_duration_seconds: recommendation.durationSeconds,
    target_provider_error_safe: recommendation.safeError,
    target_stops: stops,
    operation_id: operationId,
  });
  if (error) {
    if (error.message.includes("route_stop_window_invalid")) return initialError("Giờ dự kiến các điểm dừng không hợp lệ. Kiểm tra giờ khởi hành và thời gian mỗi điểm.");
    if (error.message.includes("stale")) return initialError("Một chuyến giao vừa thay đổi. Tải lại trang rồi chọn lại.");
    return initialError(error.message);
  }
  revalidatePath("/admin/routes");
  return {
    status: "success",
    message: recommendation.state === "RECOMMENDED" ? "Đã tạo đề xuất lộ trình. Kiểm tra rồi bấm Áp dụng và phân giao." : "Đã tạo thứ tự thủ công vì dịch vụ bản đồ không khả dụng. Kiểm tra rồi bấm Áp dụng và phân giao.",
    planId: String(data),
  };
}

export async function applyRoutePlanAction(_previous: RouteActionState, formData: FormData): Promise<RouteActionState> {
  await requireInternalPermission("delivery.assign");
  const planId = String(formData.get("plan_id") ?? "");
  const expectedVersion = Number(formData.get("expected_version"));
  const operationId = String(formData.get("operation_id") ?? "");
  if (!planId || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !/^[0-9a-f-]{36}$/i.test(operationId)) return initialError("Lộ trình không hợp lệ.");
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("apply_route_plan", {
    target_route_plan_id: planId,
    expected_version: expectedVersion,
    operation_id: operationId,
  });
  if (error) {
    const stale = error.message.includes("stale") || error.message.includes("version_conflict");
    if (error.message.includes("schedule_collision")) return initialError("Khung giờ phân giao đang chồng lấn. Mở từng phiếu giao để chốt giờ bắt đầu và kết thúc, rồi tạo lại đề xuất lộ trình theo dữ liệu mới.");
    if (error.message.includes("route_stop_schedule_required")) return initialError("Lộ trình này lập trước khi có giờ dự kiến từng điểm nên chưa xếp lịch được phiếu chưa có lịch. Tạo lại đề xuất lộ trình.");
    return initialError(stale ? "Dữ liệu giao hàng đã thay đổi. Tạo lại lộ trình trước khi áp dụng." : error.message);
  }
  revalidatePath("/admin/routes");
  return { status: "success", message: "Đã áp dụng lộ trình và cập nhật phân công.", planId };
}
