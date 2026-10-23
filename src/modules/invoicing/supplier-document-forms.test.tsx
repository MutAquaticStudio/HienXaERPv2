import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/components/reliable-command-form", () => ({ ReliableCommandForm: ({ children }: { children: React.ReactNode }) => <form>{children}</form> }));
vi.mock("./document-actions", () => ({ registerSupplierDocumentAction: vi.fn(), reviewSupplierDocumentAction: vi.fn() }));
import { lineValue, SupplierDocumentForm, type DocumentSource } from "./supplier-document-forms";

const source: DocumentSource = { source_kind: "RECEIPT_LINE", source_id: "s1", supplier_id: "n1", supplier_name: "NCC Hòa Phát", source_number: "PN-0001", material_name: "Xi măng",
  uom_symbol: "bao", source_quantity: "4.000000", source_unit_cost: "80000", source_value_vnd: "320000", document_kind: "INVOICE",
  purchase_order_number: "PO-0001", ordered_quantity: "10.000000", received_quantity: "4.000000", ordered_unit_cost: "80000", price_source_type: "LIST" };

it("computes the line value from quantity and price", () => {
  expect(lineValue("2,5", "80000")).toBe("200000");
  expect(lineValue("", "80000")).toBe("");
});

it("shows ordered, received and invoiced quantities with the order price source and flags differences (FB10)", () => {
  render(<SupplierDocumentForm sources={[source]} operationId="o" scope="s" today="2026-10-23" />);
  fireEvent.change(screen.getByLabelText("Nhà cung cấp"), { target: { value: "n1" } });
  expect(screen.getByText("Đơn mua PO-0001")).toBeInTheDocument();
  expect(screen.getByText("Bảng giá NCC")).toBeInTheDocument();
  expect(screen.getByText("10")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Chọn PN-0001 Xi măng"));
  expect(screen.getByText(/Khớp$/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Giá hóa đơn PN-0001 Xi măng"), { target: { value: "85000" } });
  expect(screen.getByLabelText("Thành tiền hóa đơn PN-0001 Xi măng")).toHaveValue("340000");
  expect(screen.getByLabelText("Giá hóa đơn PN-0001 Xi măng").closest("td")).toHaveClass("variance");
  expect(screen.getByText(/1 dòng lệch/)).toBeInTheDocument();
});
