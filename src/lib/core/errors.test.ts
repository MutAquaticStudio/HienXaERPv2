import { describe, expect, it } from "vitest";
import { AppError, operationalPostingError, userFacingError } from "./errors";

describe("user-facing errors", () => {
  it("explains the real posting block without exposing internal state or claiming success", () => {
    const text = operationalPostingError("branch_not_operational: ordinary posting requires ACTIVE");
    expect(text).toContain("Chưa thể ghi sổ");
    expect(text).toContain("chưa xác minh được điều kiện vận hành");
    expect(text).toContain("Người quản trị");
    expect(text).toContain("phiên bản hệ thống và phạm vi truy cập");
    expect(text).not.toMatch(/branch_not_operational|ACTIVE|PT423/);
    expect(userFacingError("branch_not_operational: ordinary posting requires ACTIVE")).toBe(text);
  });

  it.each([
    ["sales-order-confirmation", "đơn bán"],
    ["purchase-order-confirmation", "đơn mua"],
  ] as const)("describes %s as confirmation while preserving the default posting feedback", (context, label) => {
    const refusal = "branch_not_operational: ordinary posting requires ACTIVE";
    const text = operationalPostingError(refusal, context);
    expect(text).toContain(`Chưa thể xác nhận ${label}`);
    expect(text).toContain("chưa xác minh được điều kiện vận hành");
    expect(text).toContain("phiên bản hệ thống và phạm vi truy cập");
    expect(text).not.toMatch(/ghi sổ|branch_not_operational|ACTIVE|PT423/);
    expect(operationalPostingError("credit_limit_exceeded", context)).toBeNull();
    expect(operationalPostingError(refusal)).toBe("Chưa thể ghi sổ: chưa xác minh được điều kiện vận hành của chi nhánh. Người quản trị cần kiểm tra phiên bản hệ thống và phạm vi truy cập.");
  });

  it.each([undefined, null, "", "PT423", "forbidden", "PENDING_OPENING", "Something went wrong", "relation sales_order_lines does not exist"])("hides unmapped internal errors: %s", (value) => {
    expect(userFacingError(value)).toBe("Có lỗi xảy ra. Vui lòng thử lại");
    expect(operationalPostingError(value)).toBeNull();
  });

  it("preserves useful Vietnamese validation details, document codes and error-specific fallback", () => {
    const value = "Dòng 2: số lượng vượt phần còn lại của đơn SO-2026-00012.";
    expect(userFacingError(value)).toBe(value);
    const documentCode = "Dòng 2: số lượng vượt phần còn lại của đơn SO_2026_00012.";
    expect(userFacingError(documentCode)).toBe(documentCode);
    expect(userFacingError("Vật tư CAT_DA-01 chưa có giá hợp lệ.")).toBe("Vật tư CAT_DA-01 chưa có giá hợp lệ.");
    expect(userFacingError("Không thể đọc bảng sales_order_lines.", "Không thể tải đơn bán.")).toBe("Không thể tải đơn bán.");
    expect(userFacingError("Chưa thể ghi sổ: PENDING_OPENING.")).toBe("Có lỗi xảy ra. Vui lòng thử lại");
    expect(userFacingError(undefined, "Không thể xác nhận giao hàng.")).toBe("Không thể xác nhận giao hàng.");
  });

  it("does not change the existing structured application error contract", () => {
    const error = new AppError({ code: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này.", status: 403, traceId: "receipt" });
    expect(error.status).toBe(403);
    expect(error.toResponseBody()).toEqual({ error: { code: "FORBIDDEN", message: "Bạn không có quyền thực hiện thao tác này.", traceId: "receipt" } });
  });
});
