export class PlatformError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

export class AuthenticationRequiredError extends PlatformError {
  constructor() {
    super("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
  }
}

export class AccessDeniedError extends PlatformError {
  constructor(message = "Bạn không có quyền thực hiện thao tác này.") {
    super(message, "ACCESS_DENIED", 403);
  }
}

export class AccountInactiveError extends PlatformError {
  constructor(status: string) {
    super(
      "Tài khoản đã bị tạm ngưng hoặc vô hiệu hóa.",
      `ACCOUNT_${status}`,
      403,
    );
  }
}

export class UnsafeRuntimeError extends PlatformError {
  constructor(message: string) {
    super(message, "UNSAFE_RUNTIME", 503);
  }
}

export class IdempotencyConflictError extends PlatformError {
  constructor() {
    super(
      "Mã chống gửi trùng đã được dùng cho một yêu cầu khác.",
      "IDEMPOTENCY_CONFLICT",
      409,
    );
  }
}
