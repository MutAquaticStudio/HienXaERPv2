import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MaterialSearchBox } from "./material-search-box";
import type { EditorMaterial } from "./types";

afterEach(cleanup);
const kg = [{ id: "kg", symbol: "kg" }];
const materials: EditorMaterial[] = [
  { id: "g1", code: "GACH", name: "Gạch đặc", uoms: [{ id: "vien", symbol: "viên" }], group: "Gạch" },
  { id: "x30", code: "BS30", name: "Xi măng Bút Sơn PCB30", uoms: kg, group: "Xi măng", variant: { groupId: "bs", name: "Xi măng Bút Sơn", label: "PCB30" } },
  { id: "x40", code: "BS40", name: "Xi măng Bút Sơn PCB40", uoms: kg, group: "Xi măng", variant: { groupId: "bs", name: "Xi măng Bút Sơn", label: "PCB40" } },
  { id: "d1", code: "DA12", name: "Đá 1x2", uoms: [{ id: "m3", symbol: "m³" }] },
];

it("drops the whole list down on focus, grouped by material group, without typing", () => {
  const onPick = vi.fn();
  render(<MaterialSearchBox materials={materials} onPick={onPick} />);
  const box = screen.getByRole("combobox", { name: "Tìm vật tư" });
  fireEvent.focus(box);
  const list = screen.getByRole("listbox", { name: "Danh sách vật tư" });
  expect(within(list).getAllByRole("option")).toHaveLength(4);
  expect(list).toHaveTextContent("Chưa phân nhóm");
  expect(list).toHaveTextContent("Gạch");
  expect(list).toHaveTextContent("Xi măng Bút Sơn");
  fireEvent.mouseDown(within(list).getByRole("option", { name: /PCB40/ }));
  expect(onPick).toHaveBeenCalledWith(materials[2]);
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("filters the list as the user types and Escape closes it without leaving the box", () => {
  render(<MaterialSearchBox materials={materials} onPick={() => {}} />);
  const box = screen.getByRole("combobox", { name: "Tìm vật tư" });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: "xi mang" } });
  expect(within(screen.getByRole("listbox", { name: "Kết quả tìm vật tư" })).getAllByRole("option")).toHaveLength(2);
  const escape = fireEvent.keyDown(box, { key: "Escape" });
  expect(escape).toBe(false);
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("opens from the arrow button too", () => {
  render(<MaterialSearchBox materials={materials} onPick={() => {}} />);
  fireEvent.mouseDown(screen.getByRole("button", { name: "Xem danh sách vật tư" }));
  expect(screen.getByRole("combobox", { name: "Tìm vật tư" })).toHaveFocus();
  expect(screen.getByRole("listbox", { name: "Danh sách vật tư" })).toBeInTheDocument();
});
