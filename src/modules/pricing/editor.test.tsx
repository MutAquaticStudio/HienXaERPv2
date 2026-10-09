import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PricingRuleEditor } from "./editor";
import { savePricingRuleAction } from "./actions";
import { savePurchasePricingRuleAction } from "./purchase-actions";
vi.mock("./actions", () => ({ savePricingRuleAction: vi.fn(async () => ({ success: true, message: "Đã tạo chính sách giá." })) }));
vi.mock("./purchase-actions", () => ({ savePurchasePricingRuleAction: vi.fn(async () => ({ success: true, message: "Đã tạo giá mua." })) }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("allows creating another price rule after a successful save", async () => {
  render(<PricingRuleEditor options={{ customers: [], groups: [], materials: [{ id: "material", name: "Vật tư" }], units: [{ id: "uom", name: "Bao" }] }} />);
  const button = screen.getByRole("button", { name: "Tạo chính sách giá" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByText("Đã tạo chính sách giá.");
  expect(button).toBeEnabled();
  fireEvent.submit(button.closest("form")!);
  await waitFor(() => expect(savePricingRuleAction).toHaveBeenCalledTimes(2));
});

it("binds purchase scope and preserves exact money and retry identity", async () => {
  render(<PricingRuleEditor purchase command={{ targetId: "target", operationId: "operation" }} options={{ customers: [], groups: [], materials: [{ id: "material", name: "Vật tư" }], units: [{ id: "uom", name: "Bao" }], suppliers: [{ id: "supplier", name: "NCC QA" }] }} />);
  fireEvent.change(screen.getByLabelText("Nhà cung cấp *"), { target: { value: "supplier" } });
  fireEvent.change(screen.getByLabelText("Vật tư *"), { target: { value: "material" } });
  fireEvent.change(screen.getByLabelText("Đơn vị giá *"), { target: { value: "uom" } });
  fireEvent.change(screen.getByLabelText("Đơn giá (VND) *"), { target: { value: "9007199254740993" } });
  const button = screen.getByRole("button", { name: "Tạo chính sách giá" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByText("Đã tạo giá mua.");
  const payload = vi.mocked(savePurchasePricingRuleAction).mock.calls[0][1];
  expect(payload.get("unitPriceVnd")).toBe("9007199254740993");
  expect(payload.get("operationId")).toBe("operation");
  expect(payload.get("targetId")).toBe("target");
  expect(payload.get("supplierId")).toBe("supplier");
  expect(savePricingRuleAction).not.toHaveBeenCalled();
});

it("locks replacement scope and sends optimistic version without Sales action", async () => {
  render(<PricingRuleEditor purchase purchaseRule={{ id: "old", supplier_id: "supplier", material_id: "material", purchase_uom_id: "uom", unit_cost_vnd: "9007199254740993", version: 2, source_type: "CONTRACT", effective_from: "2026-10-10T00:00:00+07:00", effective_to: null, active: true }} command={{ targetId: "new", operationId: "replacement" }} options={{ customers: [], groups: [], materials: [], units: [] }} />);
  expect(screen.getByLabelText("Đơn giá (VND) *")).toHaveValue("9007199254740993");
  expect(screen.queryByLabelText("Nhà cung cấp *")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Ngừng sử dụng" })).toHaveAttribute("formnovalidate");
  const button = screen.getByRole("button", { name: "Tạo phiên bản mới" });
  fireEvent.submit(button.closest("form")!);
  await screen.findByText("Đã tạo giá mua.");
  const payload = vi.mocked(savePurchasePricingRuleAction).mock.calls[0][1];
  expect(payload.get("supersedesId")).toBe("old");
  expect(payload.get("expectedVersion")).toBe("2");
  expect(payload.get("supplierId")).toBeNull();
  expect(button).toBeDisabled();
  expect(savePricingRuleAction).not.toHaveBeenCalled();
});
