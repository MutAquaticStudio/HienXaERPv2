export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE";

export type AppErrorStatus = 401 | 403 | 404 | 409 | 422 | 429 | 503;

/** Presentation only: the database remains the authority that rejects posting. */
export function operationalPostingError(message: unknown,
  context: "posting" | "sales-order-confirmation" | "purchase-order-confirmation" = "posting"): string | null {
  if (typeof message !== "string" || !/\bbranch_not_operational\b/.test(message)) return null;
  if (context === "posting") return "Chưa thể ghi sổ: chi nhánh chưa được kích hoạt. Chủ doanh nghiệp cần xem bước còn thiếu tại Thiết lập hệ thống → Chuẩn bị vận hành.";
  const document = context === "sales-order-confirmation" ? "đơn bán" : "đơn mua";
  return `Chưa thể xác nhận ${document}: chi nhánh chưa được kích hoạt vận hành. Chủ doanh nghiệp cần xem bước còn thiếu tại Thiết lập hệ thống → Chuẩn bị vận hành.`;
}

/** Keep clear Vietnamese validation details, without displaying unmapped backend errors. */
export function userFacingError(message: string | undefined | null, fallback = "Có lỗi xảy ra. Vui lòng thử lại"): string {
  const posting = operationalPostingError(message);
  if (posting) return posting;
  const value = message?.trim();
  if (!value || !/[À-ỹĐđ]/u.test(value) || /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/.test(value)
    || /\b(?:PENDING_OPENING|READY_FOR_ACTIVATION|NOT_VERIFIED|PT\d{3})\b/.test(value)) return fallback;
  return value;
}

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: AppErrorStatus;
  readonly traceId?: string;

  constructor(input: { code: AppErrorCode; message: string; status: AppErrorStatus; traceId?: string }) {
    super(input.message);
    this.name = "AppError";
    this.code = input.code;
    this.status = input.status;
    this.traceId = input.traceId;
  }

  toResponseBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.traceId ? { traceId: this.traceId } : {}),
      },
    };
  }
}
