// ECMAScript trim whitespace; mirrored by private.normalize_po_warehouse_address.
export function normalizeWarehouseAddress(value: string | null | undefined): string | null {
  return value?.trim() || null;
}
export const warehouseAddressRequired = "Kho nhận hàng chưa có địa chỉ. Vui lòng bổ sung địa chỉ kho trước khi lưu đơn mua.";
