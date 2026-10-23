import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./supplier-return-actions", () => ({ completeSupplierReturnAction: vi.fn() }));
import { returnValue, SupplierReturnCompleteForm, type ReturnLine } from "./supplier-return-complete-form";

const lines: ReturnLine[] = [
  { id: "l1", materialCode: "XM01", materialName: "Xi măng", unit: "bao", received: "10", returnable: "4", unitCost: "80000", warehouse: "Kho A" },
  { id: "l2", materialCode: "CAT", materialName: "Cát", unit: "m³", received: "2", returnable: "0", unitCost: "300000", warehouse: "Kho A" },
];

it("adds up what goes back at the receipt price", () => {
  expect(returnValue(lines, { l1: "2,5" }).toFixed()).toBe("200000");
});

it("shows lines in purchase units and blocks more than what is left (FB10)", () => {
  render(<SupplierReturnCompleteForm receiptId="r" operationId="o" lines={lines} accounts={[]} canRefund={false} />);
  expect(screen.getByRole("button", { name: "Hoàn thành" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Số lượng trả Xi măng"), { target: { value: "5" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Xi măng: chỉ còn trả được 4 bao.");
  fireEvent.change(screen.getByLabelText("Số lượng trả Xi măng"), { target: { value: "2" } });
  expect(screen.getByText("160.000 ₫", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Hoàn thành" })).toBeEnabled();
});
