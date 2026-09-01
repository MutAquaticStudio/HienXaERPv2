import { PlatformError } from "@/modules/platform/errors";
import type {
  FinanceCommandKind,
  FinancialAccountType,
  PaymentDirection,
} from "@/modules/finance/types";
import {
  DIRECT_COST_CATEGORIES,
  type DirectCostCategory,
} from "@/modules/profitability/types";

export const EXPENSE_ALLOCATION_DIMENSIONS = [
  "ORDER",
  "CUSTOMER",
  "VEHICLE",
  "SERVICE_JOB",
  "GENERAL",
] as const;
export type ExpenseAllocationDimension =
  (typeof EXPENSE_ALLOCATION_DIMENSIONS)[number];

export type FinanceCommandInput =
  | {
      kind: "finance.account.create";
      accountCode: string;
      accountName: string;
      accountType: FinancialAccountType;
      currency: string;
      bankName: string | null;
      maskedNumber: string | null;
    }
  | {
      kind: "finance.payment.create";
      direction: PaymentDirection;
      accountId: string;
      destinationAccountId: string | null;
      customerId: string | null;
      supplierId: string | null;
      currency: string;
      amount: string;
      paymentDate: string;
      externalReference: string | null;
      note: string | null;
    }
  | {
      kind: "finance.payment.allocate";
      paymentId: string;
      targetKind: "RECEIVABLE" | "PAYABLE";
      targetId: string;
      amount: string;
    }
  | { kind: "finance.payment.post"; paymentId: string }
  | { kind: "finance.payment.reverse"; paymentId: string; reason: string }
  | {
      kind: "finance.advance.apply";
      advanceKind: "CUSTOMER" | "SUPPLIER";
      advanceId: string;
      targetId: string;
      amount: string;
    }
  | {
      kind: "finance.expense.create";
      accountId: string;
      expenseDate: string;
      category: string;
      description: string;
      currency: string;
      amount: string;
    }
  | {
      kind: "finance.expense.allocate";
      expenseId: string;
      allocationDimension: ExpenseAllocationDimension;
      allocationReferenceId: string | null;
      allocationPercent: string;
      directCostCategory: DirectCostCategory | null;
      reason: string;
    }
  | { kind: "finance.expense.post"; expenseId: string }
  | { kind: "finance.expense.reverse"; expenseId: string; reason: string }
  | {
      kind: "finance.adjustment.post";
      targetKind: "RECEIVABLE" | "PAYABLE";
      targetId: string;
      signedAmount: string;
      reason: string;
    }
  | { kind: "finance.adjustment.reverse"; adjustmentId: string; reason: string }
  | {
      kind: "finance.bank.import";
      accountId: string;
      externalId: string;
      transactionDate: string;
      signedAmount: string;
      currency: string;
      description: string;
    }
  | {
      kind: "finance.payment.reconcile";
      paymentId: string;
      bankTransactionId: string;
    };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_FINANCE_DATA", 400);
}
function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}
function required(
  formData: FormData,
  name: string,
  label: string,
  maximum = 500,
) {
  const item = value(formData, name);
  if (!item) invalid(`${label} là bắt buộc.`);
  if (item.length > maximum) invalid(`${label} quá dài.`);
  return item;
}
function optional(formData: FormData, name: string, maximum = 500) {
  const item = value(formData, name);
  if (item.length > maximum) invalid(`${name} quá dài.`);
  return item || null;
}
function id(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 80);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}
function optionalId(formData: FormData, name: string, label: string) {
  const item = value(formData, name);
  if (!item) return null;
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}
function money(
  formData: FormData,
  name: string,
  label: string,
  signed = false,
) {
  const item = required(formData, name, label, 24);
  const pattern = signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/;
  if (!pattern.test(item) || Number(item) === 0)
    invalid(`${label} không hợp lệ.`);
  return item;
}
function date(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item) || Number.isNaN(Date.parse(item)))
    invalid(`${label} không hợp lệ.`);
  return item;
}
function currency(formData: FormData) {
  const item = required(formData, "currency", "Tiền tệ", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(item)) invalid("Tiền tệ không hợp lệ.");
  return item;
}
function reason(formData: FormData) {
  const item = required(formData, "reason", "Lý do", 500);
  if (item.length < 10) invalid("Lý do cần ít nhất 10 ký tự.");
  return item;
}

function percent(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 8);
  if (
    !/^\d+(?:\.\d{1,4})?$/.test(item) ||
    Number(item) <= 0 ||
    Number(item) > 100
  ) {
    invalid(`${label} phải lớn hơn 0 và không vượt quá 100.`);
  }
  return item;
}

export function parseFinanceForm(formData: FormData): FinanceCommandInput {
  const kind = required(
    formData,
    "kind",
    "Loại thao tác",
    50,
  ) as FinanceCommandKind;
  switch (kind) {
    case "finance.account.create": {
      const accountType = required(
        formData,
        "accountType",
        "Loại tài khoản",
        10,
      ) as FinancialAccountType;
      if (!["CASH", "BANK"].includes(accountType))
        invalid("Loại tài khoản không hợp lệ.");
      return {
        kind,
        accountCode: required(
          formData,
          "accountCode",
          "Mã tài khoản",
          30,
        ).toUpperCase(),
        accountName: required(formData, "accountName", "Tên tài khoản", 120),
        accountType,
        currency: currency(formData),
        bankName: optional(formData, "bankName", 120),
        maskedNumber: optional(formData, "maskedNumber", 80),
      };
    }
    case "finance.payment.create": {
      const direction = required(
        formData,
        "direction",
        "Loại thu chi",
        30,
      ) as PaymentDirection;
      if (!["RECEIPT", "DISBURSEMENT", "INTERNAL_TRANSFER"].includes(direction))
        invalid("Loại thu chi không hợp lệ.");
      const customerId = optionalId(formData, "customerId", "Khách hàng");
      const supplierId = optionalId(formData, "supplierId", "Nhà cung cấp");
      const destinationAccountId = optionalId(
        formData,
        "destinationAccountId",
        "Tài khoản nhận",
      );
      if (direction === "RECEIPT" && !customerId)
        invalid("Khách hàng là bắt buộc cho khoản thu.");
      if (direction === "DISBURSEMENT" && !supplierId)
        invalid("Nhà cung cấp là bắt buộc cho khoản chi.");
      if (direction === "INTERNAL_TRANSFER" && !destinationAccountId)
        invalid("Tài khoản nhận là bắt buộc.");
      return {
        kind,
        direction,
        accountId: id(formData, "accountId", "Tài khoản tiền"),
        destinationAccountId,
        customerId,
        supplierId,
        currency: currency(formData),
        amount: money(formData, "amount", "Số tiền"),
        paymentDate: date(formData, "paymentDate", "Ngày thu chi"),
        externalReference: optional(formData, "externalReference", 120),
        note: optional(formData, "note", 500),
      };
    }
    case "finance.payment.allocate": {
      const targetKind = required(
        formData,
        "targetKind",
        "Loại công nợ",
        20,
      ) as "RECEIVABLE" | "PAYABLE";
      if (!["RECEIVABLE", "PAYABLE"].includes(targetKind))
        invalid("Loại công nợ không hợp lệ.");
      return {
        kind,
        paymentId: id(formData, "paymentId", "Khoản thu chi"),
        targetKind,
        targetId: id(formData, "targetId", "Công nợ"),
        amount: money(formData, "amount", "Số tiền phân bổ"),
      };
    }
    case "finance.payment.post":
      return { kind, paymentId: id(formData, "paymentId", "Khoản thu chi") };
    case "finance.payment.reverse":
      return {
        kind,
        paymentId: id(formData, "paymentId", "Khoản thu chi"),
        reason: reason(formData),
      };
    case "finance.advance.apply": {
      const advanceKind = required(
        formData,
        "advanceKind",
        "Loại tiền ứng trước",
        20,
      ) as "CUSTOMER" | "SUPPLIER";
      if (!["CUSTOMER", "SUPPLIER"].includes(advanceKind))
        invalid("Loại tiền ứng trước không hợp lệ.");
      return {
        kind,
        advanceKind,
        advanceId: id(formData, "advanceId", "Tiền ứng trước"),
        targetId: id(formData, "targetId", "Công nợ"),
        amount: money(formData, "amount", "Số tiền cấn trừ"),
      };
    }
    case "finance.expense.create":
      return {
        kind,
        accountId: id(formData, "accountId", "Tài khoản tiền"),
        expenseDate: date(formData, "expenseDate", "Ngày chi phí"),
        category: required(formData, "category", "Nhóm chi phí", 80),
        description: required(formData, "description", "Nội dung chi phí", 500),
        currency: currency(formData),
        amount: money(formData, "amount", "Số tiền"),
      };
    case "finance.expense.allocate": {
      const allocationDimension = required(
        formData,
        "allocationDimension",
        "Chiều phân bổ",
        20,
      ) as ExpenseAllocationDimension;
      if (!EXPENSE_ALLOCATION_DIMENSIONS.includes(allocationDimension)) {
        invalid("Chiều phân bổ không hợp lệ.");
      }
      const allocationReferenceId = optionalId(
        formData,
        "allocationReferenceId",
        "Tham chiếu phân bổ",
      );
      if (
        (allocationDimension === "GENERAL" && allocationReferenceId) ||
        (allocationDimension !== "GENERAL" && !allocationReferenceId)
      ) {
        invalid("Tham chiếu phân bổ không hợp lệ cho chiều đã chọn.");
      }
      const categoryValue = value(
        formData,
        "directCostCategory",
      ) as DirectCostCategory;
      const directCostCategory = categoryValue || null;
      if (
        (allocationDimension === "ORDER" &&
          (!directCostCategory ||
            !DIRECT_COST_CATEGORIES.includes(directCostCategory))) ||
        (allocationDimension !== "ORDER" && directCostCategory)
      ) {
        invalid(
          "Nhóm chi phí trực tiếp chỉ bắt buộc cho phân bổ theo đơn bán.",
        );
      }
      return {
        kind,
        expenseId: id(formData, "expenseId", "Chi phí"),
        allocationDimension,
        allocationReferenceId,
        allocationPercent: percent(
          formData,
          "allocationPercent",
          "Tỷ lệ phân bổ",
        ),
        directCostCategory,
        reason: reason(formData),
      };
    }
    case "finance.expense.post":
      return { kind, expenseId: id(formData, "expenseId", "Chi phí") };
    case "finance.expense.reverse":
      return {
        kind,
        expenseId: id(formData, "expenseId", "Chi phí"),
        reason: reason(formData),
      };
    case "finance.adjustment.post": {
      const targetKind = required(
        formData,
        "targetKind",
        "Loại công nợ",
        20,
      ) as "RECEIVABLE" | "PAYABLE";
      if (!["RECEIVABLE", "PAYABLE"].includes(targetKind))
        invalid("Loại công nợ không hợp lệ.");
      return {
        kind,
        targetKind,
        targetId: id(formData, "targetId", "Công nợ"),
        signedAmount: money(
          formData,
          "signedAmount",
          "Số tiền điều chỉnh",
          true,
        ),
        reason: reason(formData),
      };
    }
    case "finance.adjustment.reverse":
      return {
        kind,
        adjustmentId: id(formData, "adjustmentId", "Bút toán điều chỉnh"),
        reason: reason(formData),
      };
    case "finance.bank.import":
      return {
        kind,
        accountId: id(formData, "accountId", "Tài khoản ngân hàng"),
        externalId: required(
          formData,
          "externalId",
          "Mã giao dịch ngân hàng",
          120,
        ),
        transactionDate: date(formData, "transactionDate", "Ngày giao dịch"),
        signedAmount: money(
          formData,
          "signedAmount",
          "Số tiền ngân hàng",
          true,
        ),
        currency: currency(formData),
        description: required(
          formData,
          "description",
          "Nội dung giao dịch",
          500,
        ),
      };
    case "finance.payment.reconcile":
      return {
        kind,
        paymentId: id(formData, "paymentId", "Khoản thu chi"),
        bankTransactionId: id(
          formData,
          "bankTransactionId",
          "Giao dịch ngân hàng",
        ),
      };
    default:
      return invalid("Thao tác tài chính không được hỗ trợ.");
  }
}
