export function inventoryMovementLabel(value: string) {
  return ({
    PURCHASE_RECEIPT: "Nhận hàng NCC",
    DELIVERY_HANDOFF: "Bàn giao lên xe",
    DELIVERY_VERIFIED: "Khách đã nhận",
    STOCK_ADJUSTMENT: "Điều chỉnh kiểm kho",
    RETURN_TRANSFER: "Nhận hàng còn lại",
    CUSTOMER_RETURN: "Khách trả hàng",
    TRANSIT_LOSS: "Hao hụt đang giao",
  } as Record<string, string>)[value] ?? value;
}

export function stockCountStateLabel(value: string) {
  return ({ OPEN: "Đang kiểm", APPROVED: "Đã duyệt", CANCELLED: "Đã hủy" } as Record<string, string>)[value] ?? value;
}
