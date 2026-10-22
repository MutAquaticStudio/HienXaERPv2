import { expect, it } from "vitest";
import { expenseSettlementLabel, operatingExpenseError, parseOperatingExpense } from "./operating-expense";

const op = "7e000000-0000-4000-8000-0000000000a1";
const supplier = "7e000000-0000-4000-8000-000000000003";
const account = "7e000000-0000-4000-8000-000000000001";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ categoryName: "Marketing", amount: "2000000", effectiveAt: "2026-10-22T09:00", payeeKind: "OTHER",
    settlement: "PAID_NOW", accountId: account, operationId: op, ...values })) data.set(key, value);
  return data;
};

it("reads a paid-now expense to anyone, dropping fields that do not apply", () => {
  const parsed = parseOperatingExpense(form({ payeeName: " Công ty ABC ", supplierId: supplier, countsInProfit: "on", description: "  " }));
  expect(parsed).toEqual({ ok: true, value: { categoryName: "Marketing", amount: "2000000", effectiveAt: "2026-10-22T09:00", payeeKind: "OTHER",
    supplierId: null, employeeId: null, payeeName: "Công ty ABC", settlement: "PAID_NOW", accountId: account, countsInProfit: true,
    description: null, salesOrderId: null, operationId: op } });
});

it("reads a supplier debt without an account and kept out of profit", () => {
  const parsed = parseOperatingExpense(form({ payeeKind: "SUPPLIER", supplierId: supplier, settlement: "PAYABLE" }));
  expect(parsed.ok && parsed.value).toMatchObject({ payeeKind: "SUPPLIER", supplierId: supplier, settlement: "PAYABLE", accountId: null, countsInProfit: false });
});

it("names the field to fix", () => {
  const field = (values: Record<string, string>) => { const parsed = parseOperatingExpense(form(values)); return parsed.ok ? null : parsed.field; };
  expect(field({ categoryName: "M" })).toBe("categoryName");
  expect(field({ amount: "0" })).toBe("amount");
  expect(field({ amount: "abc" })).toBe("amount");
  expect(field({ effectiveAt: "" })).toBe("effectiveAt");
  expect(field({ payeeKind: "SUPPLIER" })).toBe("supplierId");
  expect(field({ payeeKind: "EMPLOYEE" })).toBe("employeeId");
  expect(field({ settlement: "PAYABLE" })).toBe("settlement");
  expect(field({ accountId: "" })).toBe("accountId");
  expect(field({ description: "x".repeat(501) })).toBe("description");
});

it("explains database refusals in Vietnamese without codes", () => {
  expect(operatingExpenseError("forbidden", "42501").message).toContain("không có quyền");
  expect(operatingExpenseError("invalid_finance_account", "23503")).toMatchObject({ field: "accountId" });
  expect(operatingExpenseError("invalid_expense_supplier", "23503")).toMatchObject({ field: "supplierId" });
  expect(operatingExpenseError("invalid_expense", "22023").message).toContain("chưa hợp lệ");
  expect(operatingExpenseError("something_else", "P0001").message).not.toMatch(/[a-z]+_[a-z]+/);
  expect(expenseSettlementLabel("PAID_NOW")).toBe("Đã trả ngay");
  expect(expenseSettlementLabel("NON_CASH")).toBe("Không dùng tiền");
  expect(expenseSettlementLabel("PAYABLE")).toBe("Ghi nợ NCC");
});
