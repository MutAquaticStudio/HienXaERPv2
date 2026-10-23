import Decimal from "decimal.js";

export const transferEventLabel = { DISPATCH: "Xuất kho", RECEIVE: "Nhận hàng", REPORT_SHORTAGE: "Báo thiếu / hỏng", APPROVE_LOSS: "Duyệt hao hụt", CLOSE_DISPATCH: "Đóng phần chưa xuất" } as const;

type TransferAmounts = { planned_base_quantity: string; shipped_base_quantity: string; received_base_quantity: string; in_transit_base_quantity: string; transfer_state: string; dispatch_closed: boolean };

/** KiotViet-style status of a transfer and the one-tap step it waits for (FB10). */
export function transferStatus(t: TransferAmounts): { label: string; tone: "success" | "warning" | "info"; step: "DISPATCH_ALL" | "RECEIVE_ALL" | null } {
 const shipped = new Decimal(t.shipped_base_quantity), inTransit = new Decimal(t.in_transit_base_quantity);
 if (t.transfer_state === "CLOSED") return { label: "Đã nhận", tone: "success", step: null };
 if (shipped.isZero() && !t.dispatch_closed) return { label: "Phiếu tạm", tone: "info", step: "DISPATCH_ALL" };
 if (inTransit.gt(0)) return { label: "Đang chuyển", tone: "warning", step: "RECEIVE_ALL" };
 if (!t.dispatch_closed && shipped.lt(t.planned_base_quantity)) return { label: "Xuất một phần", tone: "warning", step: "DISPATCH_ALL" };
 return { label: "Còn hồ sơ thiếu", tone: "warning", step: null };
}
