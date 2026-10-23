import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ExpandableRows } from "./expandable-rows";
import { ListFilterGroup, countText } from "./list-filter-group";

afterEach(cleanup);

const rows = [
  { id: "a", label: "SO-1", cells: <><td>SO-1</td><td>Anh Tuấn</td></>, detail: <p>Xi măng 60 bao</p> },
  { id: "b", label: "SO-2", cells: <><td>SO-2</td><td>KH01</td></>, detail: <p>Cát 4 m³</p> },
];

it("opens one summary at a time under its row", () => {
  render(<table><ExpandableRows rows={rows} columns={3} /></table>);
  expect(screen.queryByText("Xi măng 60 bao")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xem nhanh SO-1" }));
  expect(screen.getByText("Xi măng 60 bao").closest("td")).toHaveAttribute("colspan", "3");
  expect(screen.getByRole("button", { name: "Thu gọn SO-1" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "Xem nhanh SO-2" }));
  expect(screen.queryByText("Xi măng 60 bao")).not.toBeInTheDocument();
  expect(screen.getByText("Cát 4 m³")).toBeInTheDocument();
});

it("lists filter options with their counts and the current one checked", () => {
  render(<form><ListFilterGroup legend="Trạng thái" name="state" value="DRAFT" options={[
    { value: "", label: "Đang làm việc", count: 12 }, { value: "DRAFT", label: "Nháp", count: countText(new Array(120)) }]} /></form>);
  expect(screen.getByRole("group", { name: "Trạng thái" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /Nháp/ })).toBeChecked();
  expect(screen.getByRole("radio", { name: /Đang làm việc/ })).not.toBeChecked();
  expect(screen.getByText("99+")).toBeInTheDocument();
  expect(countText([1, 2, 3])).toBe(3);
  expect(countText(null)).toBeUndefined();
});
