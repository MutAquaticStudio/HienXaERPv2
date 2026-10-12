import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { VietnameseFormValidation } from "./vietnamese-form-validation";

afterEach(cleanup);

it("localizes native required and email errors and allows a corrected value", () => {
  render(<><VietnameseFormValidation /><input aria-label="Thư điện tử" type="email" required /></>);
  const field = screen.getByRole("textbox") as HTMLInputElement;
  expect(field.checkValidity()).toBe(false);
  expect(field.validationMessage).toBe("Vui lòng nhập thông tin này");
  fireEvent.input(field, { target: { value: "invalid" } });
  expect(field.checkValidity()).toBe(false);
  expect(field.validationMessage).toBe("Vui lòng nhập địa chỉ thư điện tử hợp lệ");
  fireEvent.input(field, { target: { value: "employee@example.test" } });
  expect(field.checkValidity()).toBe(true);
  expect(field.validationMessage).toBe("");
});

it("preserves a component's own business validation feedback", () => {
  render(<><VietnameseFormValidation /><input aria-label="Số lượng" /></>);
  const field = screen.getByRole("textbox") as HTMLInputElement;
  field.setCustomValidity("Số lượng vượt mức đã duyệt");
  expect(field.checkValidity()).toBe(false);
  expect(field.validationMessage).toBe("Số lượng vượt mức đã duyệt");
  fireEvent.input(field, { target: { value: "1" } });
  expect(field.validationMessage).toBe("Số lượng vượt mức đã duyệt");
});

it("does not clear a business error set after a translated native error", () => {
  render(<><VietnameseFormValidation /><input aria-label="Số lượng" required /></>);
  const field = screen.getByRole("textbox") as HTMLInputElement;
  field.checkValidity();
  field.setCustomValidity("Số lượng vượt mức đã duyệt");
  fireEvent.input(field, { target: { value: "1" } });
  expect(field.validationMessage).toBe("Số lượng vượt mức đã duyệt");
});

it("accepts a value corrected programmatically after native feedback", () => {
  render(<><VietnameseFormValidation /><input aria-label="Thư điện tử" type="email" required /></>);
  const field = screen.getByRole("textbox") as HTMLInputElement;
  expect(field.checkValidity()).toBe(false);
  field.value = "employee@example.test";
  // The first validity check dispatches invalid for the old custom message and clears it.
  field.checkValidity();
  expect(field.validationMessage).toBe("");
  expect(field.checkValidity()).toBe(true);
});

it("keeps number limits and required select constraints effective", () => {
  render(<><VietnameseFormValidation /><input aria-label="Số lượng" type="number" min="1" max="5" /><select aria-label="Kho hàng" required><option value="">Chọn kho</option><option value="warehouse">Kho chính</option></select></>);
  const amount = screen.getByRole("spinbutton") as HTMLInputElement;
  fireEvent.input(amount, { target: { value: "0" } });
  expect(amount.checkValidity()).toBe(false);
  expect(amount.validationMessage).toBe("Vui lòng nhập giá trị từ 1 trở lên");
  fireEvent.input(amount, { target: { value: "6" } });
  expect(amount.checkValidity()).toBe(false);
  expect(amount.validationMessage).toBe("Vui lòng nhập giá trị không vượt quá 5");
  const warehouse = screen.getByRole("combobox") as HTMLSelectElement;
  expect(warehouse.checkValidity()).toBe(false);
  expect(warehouse.validationMessage).toBe("Vui lòng nhập thông tin này");
  fireEvent.change(warehouse, { target: { value: "warehouse" } });
  expect(warehouse.checkValidity()).toBe(true);
});
