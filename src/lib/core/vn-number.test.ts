import { describe, expect, it } from "vitest";
import { decimalForEditing, normalizeDecimalInput, normalizeVndInput, vndForEditing } from "./vn-number";

describe("normalizeDecimalInput", () => {
  it.each([
    ["1,5", "1.5"], ["1.5", "1.5"], ["12", "12"], ["0,125", "0.125"], ["0.125", "0.125"],
    ["1.250", "1250"], ["1.000", "1000"], ["12.500", "12500"], ["1.250.000", "1250000"],
    ["1.250,5", "1250.5"], ["1,250.5", "1250.5"], ["1,250,000", "1250000"], [" 2 ", "2"], ["1,500000", "1.5"],
  ])("reads %j as %s", (input, expected) => expect(normalizeDecimalInput(input)).toBe(expected));

  it.each(["", "abc", "1,2,3", "1.2.3", "1.25,5,1", "-1", "1,2345678", "12.50.0"])("rejects %j", (input) =>
    expect(normalizeDecimalInput(input)).toBeNull());

  it("keeps at most the allowed number of decimals", () => {
    expect(normalizeDecimalInput("1,123456")).toBe("1.123456");
    expect(normalizeDecimalInput("1,1234567")).toBeNull();
    expect(normalizeDecimalInput("1,5", 0)).toBeNull();
  });
});

describe("normalizeVndInput", () => {
  it.each([["120.000", "120000"], ["120,000", "120000"], ["120 000 đ", "120000"], ["120000", "120000"], ["1.250.000₫", "1250000"], ["0", "0"]])(
    "reads %j as %s", (input, expected) => expect(normalizeVndInput(input)).toBe(expected));
  it.each(["", "12,5", "1.25", "abc", "-1000"])("rejects %j", (input) => expect(normalizeVndInput(input)).toBeNull());
});

describe("decimalForEditing", () => {
  it("shows stored quantities with a comma and no padding", () => {
    expect(decimalForEditing("1.500000")).toBe("1,5");
    expect(decimalForEditing("1250")).toBe("1250");
    expect(decimalForEditing("abc")).toBe("abc");
  });
});

describe("vndForEditing", () => {
  it("groups whole đồng and leaves other text as typed", () => {
    expect(vndForEditing("300000")).toBe("300.000");
    expect(vndForEditing("")).toBe("");
    expect(vndForEditing("12,5")).toBe("12,5");
  });
});
