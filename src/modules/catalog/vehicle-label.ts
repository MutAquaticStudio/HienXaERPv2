/** D54: a vehicle may have no plate number. Show "code · plate" when both exist, otherwise whichever is set. */
export function vehicleName(vehicle: { code?: string | null; plate_number?: string | null }): string {
  const code = vehicle.code?.trim() || null;
  const plate = vehicle.plate_number?.trim() || null;
  return code && plate ? `${code} · ${plate}` : plate ?? code ?? "";
}
