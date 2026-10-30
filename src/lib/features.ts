/**
 * Owner decision D1 (2026-10-15): quotations are switched off on every surface.
 * Data, RPCs and permissions stay in place; turning this back on restores the screens.
 */
export const QUOTATIONS_ENABLED: boolean = false;

export const QUOTATIONS_DISABLED_MESSAGE = "Chức năng báo giá đã tắt. Hãy tạo đơn bán trực tiếp.";

/**
 * Owner decision D8 (2026-10-16): customer payment notices ("Báo chuyển khoản") are switched off on every surface, the same
 * way as quotations. Notices already sent, their RPCs and permissions stay; turning this back on restores the screens.
 */
export const PAYMENT_NOTICES_ENABLED: boolean = false;

export const PAYMENT_NOTICES_DISABLED_MESSAGE = "Chức năng báo chuyển khoản đã tắt. Tiền khách chuyển được ghi thu tại Công nợ.";

/**
 * Owner decision D41 (2026-10-30): the invoice module (customer invoice records, supplier documents and their matching) is
 * paused until the new tax-declaration and e-invoice rules have been studied. Its menu entry stays, labelled "(tạm ngừng)",
 * and opens a notice; data, RPCs and permissions stay in place, so turning this back on restores the screens.
 */
export const E_INVOICES_ENABLED: boolean = false;

export const E_INVOICES_PAUSED_MESSAGE = "Hóa đơn điện tử đang tạm ngừng, chờ hoàn tất nghiên cứu quy định mới về kê khai thuế và hóa đơn điện tử.";
