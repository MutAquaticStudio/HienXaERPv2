import { expect, it } from "vitest";
import { actionPhrase, auditSentence, entityCodesFor, ENTITY_FILTERS } from "./presentation";

it("says what was done in the owner's words, never 'thao tác trên đối tượng nghiệp vụ' (D60)", () => {
  expect(auditSentence("Owner Hiền Xa (HX_OWNER)", "sales_order.confirm", "sales_order")).toBe("Owner Hiền Xa (HX_OWNER) đã xác nhận đơn bán");
  expect(actionPhrase("delivery.auto_dispatched", "delivery")).toBe("tự điều phối phiếu giao");
  expect(actionPhrase("catalog.save", "materials")).toBe("lưu vật tư");
  expect(actionPhrase("profile.save", "customer_sites")).toBe("lưu hồ sơ công trình");
  expect(actionPhrase("stock_count.line.recorded", "stock_count_line")).toBe("ghi số kiểm");
  expect(actionPhrase("employee.access.revoke", "employee_branch_access")).toBe("thu hồi quyền vào chi nhánh của nhân viên");
  expect(actionPhrase("catalog.save_units", "materials")).toBe("lưu đơn vị tính của vật tư");
  expect(actionPhrase("branch_operation_settings.saved", "branches")).toBe("lưu cài đặt giao hàng của chi nhánh");
  expect(actionPhrase("purchase_order.receive", "purchase_receipt")).toBe("nhận hàng vào kho");
  // An action not listed is read from its last word and the kind of object.
  expect(actionPhrase("quotation.published", "quotation")).toBe("đăng báo giá");
  expect(actionPhrase("something.odd", "nothing_known")).toBe("thao tác trên dữ liệu");
});

it("filters by kind of object across its stored codes", () => {
  expect(entityCodesFor("khách hàng").sort()).toEqual(["customer", "customers"]);
  expect(ENTITY_FILTERS).toContain("đơn bán");
  expect(new Set(ENTITY_FILTERS).size).toBe(ENTITY_FILTERS.length);
});
