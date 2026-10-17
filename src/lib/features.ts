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
