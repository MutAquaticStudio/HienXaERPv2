import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntityCombobox, ENTITY_SEARCH_DEBOUNCE_MS } from "./entity-combobox";
import { addMaterialLine, MAX_DOCUMENT_LINES } from "./lines";
import { matchesSearch, searchKey } from "./search-text";
import type { EditorLine } from "./types";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("search text", () => {
  it("ignores accents, đ and case, and needs every word", () => {
    expect(searchKey("  Đá Xây Dựng ")).toBe("da xay dung");
    expect(matchesSearch("xi mang", "XM01", "Xi măng PCB40")).toBe(true);
    expect(matchesSearch("pcb mang", "XM01", "Xi măng PCB40")).toBe(true);
    expect(matchesSearch("xm01", "XM01", "Xi măng")).toBe(true);
    expect(matchesSearch("thép", "XM01", "Xi măng")).toBe(false);
  });
});

describe("adding a material", () => {
  const cement = { id: "m1", code: "XM01", name: "Xi măng", uoms: [{ id: "bao", symbol: "bao" }, { id: "tan", symbol: "tấn" }] };
  const base: EditorLine = { key: 0, sourceLineId: "", materialId: "m1", uomId: "bao", quantity: "2.5", manualPriceVnd: "", manualReason: "" };

  it("adds one to the same material in its default unit, exactly", () => {
    const result = addMaterialLine([base], cement, 1)!;
    expect(result.lines).toEqual([{ ...base, quantity: "3.5" }]);
    expect(result.focusKey).toBe(0);
  });

  it("starts a new line when the unit differs or the line carries a manual price", () => {
    expect(addMaterialLine([{ ...base, uomId: "tan" }], cement, 1)!.lines).toHaveLength(2);
    const result = addMaterialLine([{ ...base, manualPriceVnd: "90000" }], cement, 7)!;
    expect(result.lines[1]).toMatchObject({ key: 7, materialId: "m1", uomId: "bao", quantity: "1" });
    expect(result.focusKey).toBe(7);
  });

  it("stops at the line limit", () => {
    const full = Array.from({ length: MAX_DOCUMENT_LINES }, (_, key) => ({ ...base, key, materialId: `x${key}` }));
    expect(addMaterialLine(full, cement, 99)).toBeNull();
  });
});

describe("entity combobox", () => {
  const options = [{ id: "a", label: "Khách A" }, { id: "b", label: "Khách B", detail: "0909" }];

  it("never selects on its own and picks with arrow keys + Enter", () => {
    const onSelect = vi.fn();
    render(<form onSubmit={() => { throw new Error("submitted"); }}><EntityCombobox label="Khách hàng" name="customerId" value={null} options={options} onSelect={onSelect} /></form>);
    const input = screen.getByRole("combobox", { name: "Khách hàng" });
    fireEvent.focus(input);
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(options[1]);
  });

  it("searches after a pause and shows only the newest answer", async () => {
    vi.useFakeTimers();
    const onSearch = vi.fn(async (term: string) => [{ id: term, label: `Kết quả ${term}` }]);
    render(<EntityCombobox label="Khách hàng" name="customerId" value={null} options={options} onSearch={onSearch} onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Khách hàng" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "an" } });
    fireEvent.change(input, { target: { value: "anh" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(ENTITY_SEARCH_DEBOUNCE_MS); });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("anh");
    expect(screen.getByRole("option", { name: "Kết quả anh" })).toBeInTheDocument();
  });

  it("posts the chosen id and shows a read-only value for stored drafts", () => {
    const { container } = render(<EntityCombobox label="Khách hàng" name="customerId" value={options[1]} options={options} readOnly onSelect={vi.fn()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText("Khách B")).toBeInTheDocument();
    expect(container.querySelector<HTMLInputElement>("input[name=customerId]")?.value).toBe("b");
  });
});
