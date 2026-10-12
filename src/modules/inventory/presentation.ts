function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function inventoryMovementLabel(value: string) {
  return lookupLabel({
    PURCHASE_RECEIPT: "Nhận hàng NCC",
    DELIVERY_HANDOFF: "Bàn giao lên xe",
    DELIVERY_VERIFIED: "Khách đã nhận",
    STOCK_ADJUSTMENT: "Điều chỉnh kiểm kho",
    RETURN_TRANSFER: "Nhận hàng còn lại",
    CUSTOMER_RETURN: "Khách trả hàng",
    WAREHOUSE_TRANSFER_DISPATCH: "Xuất chuyển kho",
    WAREHOUSE_TRANSFER_RECEIPT: "Nhận chuyển kho",
    WAREHOUSE_TRANSFER_LOSS: "Hao hụt chuyển kho đã duyệt",
    TRANSIT_LOSS: "Hao hụt đang giao",
  }, value, "Phát sinh kho");
}

export function stockCountStateLabel(value: string) {
  return lookupLabel({ OPEN: "Đang kiểm", APPROVED: "Đã duyệt", CANCELLED: "Đã hủy" }, value, "Trạng thái đang cập nhật");
}
