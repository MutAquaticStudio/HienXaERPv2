import { PlatformError } from "@/modules/platform/errors";
import type { GpsLocationCommand } from "@/modules/gps/types";

function invalid(message: string): never {
  throw new PlatformError(message, "GPS_LOCATION_INVALID", 400);
}

function value(formData: FormData, name: string) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : "";
}

function decimal(
  formData: FormData,
  name: string,
  label: string,
  minimum: number,
  maximum: number,
  required = true,
) {
  const raw = value(formData, name);
  if (!raw && !required) return null;
  if (!/^-?\d+(?:\.\d{1,7})?$/.test(raw)) invalid(`${label} không hợp lệ.`);
  const number = Number(raw);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    invalid(`${label} nằm ngoài phạm vi cho phép.`);
  }
  return raw;
}

export function parseGpsLocationForm(formData: FormData): GpsLocationCommand {
  if (value(formData, "kind") !== "gps.location.record") {
    invalid("Thao tác vị trí không được hỗ trợ.");
  }
  const recordedRaw = value(formData, "recordedAt");
  const recordedAt = new Date(recordedRaw);
  if (!recordedRaw || Number.isNaN(recordedAt.getTime())) {
    invalid("Thời điểm ghi nhận vị trí không hợp lệ.");
  }
  return {
    kind: "gps.location.record",
    latitude: decimal(formData, "latitude", "Vĩ độ", -90, 90)!,
    longitude: decimal(formData, "longitude", "Kinh độ", -180, 180)!,
    accuracyM: decimal(formData, "accuracyM", "Độ chính xác", 0.01, 5000)!,
    speedMps: decimal(formData, "speedMps", "Tốc độ", 0, 100, false),
    headingDeg: decimal(formData, "headingDeg", "Hướng di chuyển", 0, 359.999, false),
    recordedAt: recordedAt.toISOString(),
  };
}
