import { describe, expect, it } from "vitest";
import { inferVariantCodePrefix, MATERIAL_CODE_PATTERN, parseVariantValues, variantCode, variantCodePrefix, variantCombos, variantKey, variantLabel, variantName } from "./variants";

describe("material variants", () => {
  it("parses typed values without blanks or repeats", () => {
    expect(parseVariantValues(" PCB30, PCB40;pcb30\n\nPCB50 ")).toEqual(["PCB30", "PCB40", "PCB50"]);
  });

  it("builds every combination in the typed order", () => {
    expect(variantCombos(["Mác"], [["PCB30", "PCB40"]])).toEqual([{ Mác: "PCB30" }, { Mác: "PCB40" }]);
    expect(variantCombos(["Mác", "Màu"], [["PCB30", "PCB40"], ["Xám", "Trắng"]])).toEqual([
      { Mác: "PCB30", Màu: "Xám" }, { Mác: "PCB30", Màu: "Trắng" }, { Mác: "PCB40", Màu: "Xám" }, { Mác: "PCB40", Màu: "Trắng" },
    ]);
    expect(variantCombos(["Mác", "Màu"], [["PCB30"], []])).toEqual([]);
  });

  it("suggests codes that satisfy the material code rule", () => {
    expect(variantCodePrefix("Xi măng Bút Sơn")).toBe("XMBS");
    expect(variantCodePrefix("Thép Hòa Phát")).toBe("THP");
    const code = variantCode("XMBS", ["Mác"], { Mác: "PCB30" });
    expect(code).toBe("XMBS-PCB30");
    expect(MATERIAL_CODE_PATTERN.test(code)).toBe(true);
    expect(variantCode("THP", ["Phi"], { Phi: "10" })).toBe("THP-10");
    expect(variantCode("xm bs", ["Màu"], { Màu: "Đỏ đậm" })).toBe("XMBS-DODAM");
    expect(variantCode("A".repeat(20), ["X"], { X: "B".repeat(40) }).length).toBe(32);
  });

  it("follows the code stem of existing variants", () => {
    const members = [{ code: "BS-PCB30", attributes: { Mác: "PCB30" } }, { code: "BS-PCB40", attributes: { Mác: "PCB40" } }];
    expect(inferVariantCodePrefix("Xi măng Bút Sơn", ["Mác"], members)).toBe("BS");
    expect(inferVariantCodePrefix("Xi măng Bút Sơn", ["Mác"], [{ code: "BS30", attributes: { Mác: "PCB30" } }])).toBe("XMBS");
    expect(inferVariantCodePrefix("Xi măng Bút Sơn", ["Mác"], [])).toBe("XMBS");
  });

  it("suggests names and keeps the attribute for bare numbers", () => {
    expect(variantName("Xi măng Bút Sơn", ["Mác"], { Mác: "PCB30" })).toBe("Xi măng Bút Sơn PCB30");
    expect(variantName("Thép Hòa Phát", ["Phi"], { Phi: "10" })).toBe("Thép Hòa Phát Phi 10");
  });

  it("identifies a combination regardless of key order and case", () => {
    expect(variantKey(["A", "B"], { B: "y", A: "X" })).toBe(variantKey(["A", "B"], { A: "x", B: "Y " }));
  });

  it("labels attributes for lists", () => {
    expect(variantLabel(["Mác", "Màu"], { Màu: "Xám", Mác: "PCB30" })).toBe("Mác: PCB30 · Màu: Xám");
    expect(variantLabel([], null)).toBe("");
  });
});
