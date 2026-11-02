/** Same rule as private.zalo_phone: a Vietnamese mobile number Zalo can receive (0912…, +84 912…, 84912…). */
export function isZaloPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return /^0[35789]\d{8}$/.test(digits) || /^84[35789]\d{8}$/.test(digits);
}
