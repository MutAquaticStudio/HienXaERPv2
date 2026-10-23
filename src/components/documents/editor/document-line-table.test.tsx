import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { isPositiveSalesQuantity } from "@/modules/sales/quantity-input";
import { DocumentLineTable } from "./document-line-table";
import type { EditorLine, EditorMaterial } from "./types";

const materials: EditorMaterial[] = [{ id: "m1", code: "XM", name: "Xi măng", uoms: [{ id: "kg", symbol: "kg" }] }] as EditorMaterial[];

function Harness({ initial, focusKey }: { initial: EditorLine; focusKey?: number }) {
  const [lines, setLines] = useState([initial]);
  return <form aria-label="đơn"><DocumentLineTable lines={lines} materials={materials} canManagePrice isValidQuantity={isPositiveSalesQuantity} priced={() => null} focusKey={focusKey}
    onChange={(key, change) => setLines((current) => current.map((line) => line.key === key ? { ...line, ...change } : line))} onRemove={() => {}} /></form>;
}
const line: EditorLine = { key: 0, sourceLineId: "", materialId: "m1", uomId: "kg", quantity: "1", manualPriceVnd: "", manualReason: "" };
afterEach(cleanup);
const posted = (name: string) => new FormData(screen.getByRole("form", { name: "đơn" }) as HTMLFormElement).getAll(name);

it("accepts Vietnamese decimals and thousands but posts the exact canonical number", () => {
  render(<Harness initial={line} />);
  const quantity = screen.getByLabelText("Số lượng dòng 1");
  fireEvent.change(quantity, { target: { value: "1,5" } });
  expect(quantity).toHaveValue("1,5");
  expect(posted("quantity")).toEqual(["1.5"]);
  fireEvent.change(quantity, { target: { value: "1.250" } });
  expect(posted("quantity")).toEqual(["1250"]);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("posts a grouped manual price as whole đồng and flags unreadable quantities", () => {
  render(<Harness initial={line} />);
  fireEvent.change(screen.getByLabelText("Đơn giá thủ công dòng 1"), { target: { value: "120.000" } });
  expect(posted("manualPriceVnd")).toEqual(["120000"]);
  fireEvent.change(screen.getByLabelText("Số lượng dòng 1"), { target: { value: "1,2,3" } });
  expect(screen.getByRole("alert")).toHaveTextContent("Nhập số lượng lớn hơn 0");
});

it("shows a stored draft quantity with the Vietnamese decimal mark", () => {
  render(<Harness initial={{ ...line, quantity: "2.500000" }} />);
  expect(screen.getByLabelText("Số lượng dòng 1")).toHaveValue("2,5");
  expect(posted("quantity")).toEqual(["2.500000"]);
});

it("keeps the cursor in the price while typing after a material was just picked", () => {
  render(<Harness initial={line} focusKey={0} />);
  expect(screen.getByLabelText("Số lượng dòng 1")).toHaveFocus();
  const price = screen.getByLabelText("Đơn giá thủ công dòng 1");
  price.focus();
  for (const typed of ["5", "55", "55000", "55.000"]) {
    fireEvent.change(price, { target: { value: typed } });
    expect(price).toHaveFocus();
  }
  expect(posted("manualPriceVnd")).toEqual(["55000"]);
});

it("shows where the price came from as a chip coloured by its kind (D29)", () => {
  render(<form><DocumentLineTable lines={[line]} materials={materials} canManagePrice={false} isValidQuantity={isPositiveSalesQuantity}
    priced={() => ({ unitPriceVnd: "91000", lineTotalVnd: "91000", sourceLabel: "Hợp đồng", sourceType: "CONTRACT" })} onChange={() => {}} onRemove={() => {}} /></form>);
  const chip = screen.getByText("Hợp đồng");
  expect(chip).toHaveClass("price-source");
  expect(chip).toHaveAttribute("data-source", "CONTRACT");
});
