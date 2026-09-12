export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE";

export type AppErrorStatus = 401 | 403 | 404 | 409 | 422 | 429 | 503;

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
