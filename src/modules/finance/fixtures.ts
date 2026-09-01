import type { FinanceSnapshot } from "@/modules/finance/types";

const CASH_ID = "81000000-0000-4000-8000-000000000001";
const BANK_ID = "81000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "33000000-0000-4000-8000-000000000001";
const SUPPLIER_ID = "51000000-0000-4000-8000-000000000001";

export const SYNTHETIC_FINANCE: FinanceSnapshot = {
  summary: {
    asOfDate: "2026-09-01",
    receivables: "428500000",
    overdueReceivables: "86500000",
    payables: "251300000",
    overduePayables: "46200000",
    cashBalance: "318400000",
    customerAdvances: "35000000",
    supplierAdvances: "18000000",
  },
  accounts: [
    { id: BANK_ID, code: "BANK-VCB", name: "Ngân hàng Vietcombank", type: "BANK", currency: "VND", balance: "286400000" },
    { id: CASH_ID, code: "CASH-HX", name: "Tiền mặt văn phòng", type: "CASH", currency: "VND", balance: "32000000" },
  ],
  receivables: [
    { id: "82000000-0000-4000-8000-000000000001", number: "AR-2026-000081", partyId: CUSTOMER_ID, partyName: "Công ty Xây dựng Minh Thành", sourceNumber: "SO-2026-00015", currency: "VND", originalAmount: "210000000", outstandingAmount: "125000000", dueDate: "2026-08-24", daysOverdue: 8, status: "PARTIALLY_SETTLED" },
    { id: "82000000-0000-4000-8000-000000000002", number: "AR-2026-000082", partyId: "33000000-0000-4000-8000-000000000002", partyName: "Nhà thầu An Phú", sourceNumber: "SO-2026-00014", currency: "VND", originalAmount: "164000000", outstandingAmount: "164000000", dueDate: "2026-09-18", daysOverdue: 0, status: "OPEN" },
  ],
  payables: [
    { id: "83000000-0000-4000-8000-000000000001", number: "AP-2026-000047", partyId: SUPPLIER_ID, partyName: "Bãi vật liệu Đông Anh", sourceNumber: "PO-2026-00031", currency: "VND", originalAmount: "132000000", outstandingAmount: "76000000", dueDate: "2026-08-27", daysOverdue: 5, status: "PARTIALLY_SETTLED" },
    { id: "83000000-0000-4000-8000-000000000002", number: "AP-2026-000048", partyId: "51000000-0000-4000-8000-000000000002", partyName: "Mỏ đá Sóc Sơn", sourceNumber: "PO-2026-00032", currency: "VND", originalAmount: "98000000", outstandingAmount: "98000000", dueDate: "2026-09-12", daysOverdue: 0, status: "OPEN" },
  ],
  payments: [
    { id: "84000000-0000-4000-8000-000000000001", number: "PAY-2026-000122", direction: "RECEIPT", status: "DRAFT", accountName: "Ngân hàng Vietcombank", partyId: CUSTOMER_ID, partyName: "Công ty Xây dựng Minh Thành", currency: "VND", amount: "85000000", allocatedAmount: "0", paymentDate: "2026-09-01", externalReference: "VCB-0901-001" },
    { id: "84000000-0000-4000-8000-000000000002", number: "PAY-2026-000121", direction: "DISBURSEMENT", status: "POSTED", accountName: "Ngân hàng Vietcombank", partyId: SUPPLIER_ID, partyName: "Bãi vật liệu Đông Anh", currency: "VND", amount: "56000000", allocatedAmount: "56000000", paymentDate: "2026-08-31", externalReference: "VCB-0831-018" },
  ],
  advances: [
    { id: "85000000-0000-4000-8000-000000000001", number: "ADV-2026-000014", kind: "CUSTOMER", partyName: "Công ty Đại Phát", currency: "VND", originalAmount: "50000000", remainingAmount: "35000000", status: "PARTIALLY_APPLIED" },
  ],
  expenses: [
    { id: "86000000-0000-4000-8000-000000000001", number: "EXP-2026-000029", accountName: "Tiền mặt văn phòng", category: "Nhiên liệu", description: "Bổ sung nhiên liệu xe giao hàng", currency: "VND", amount: "3600000", expenseDate: "2026-09-01", status: "DRAFT" },
  ],
  bankTransactions: [
    { id: "87000000-0000-4000-8000-000000000001", accountId: BANK_ID, accountName: "Ngân hàng Vietcombank", externalId: "VCB-0901-001", transactionDate: "2026-09-01", amount: "85000000", currency: "VND", description: "Minh Thành thanh toán", status: "UNMATCHED" },
  ],
  customers: [
    { id: CUSTOMER_ID, code: "KH-MT", name: "Công ty Xây dựng Minh Thành" },
    { id: "33000000-0000-4000-8000-000000000002", code: "KH-AP", name: "Nhà thầu An Phú" },
  ],
  suppliers: [
    { id: SUPPLIER_ID, code: "NCC-DA", name: "Bãi vật liệu Đông Anh" },
    { id: "51000000-0000-4000-8000-000000000002", code: "NCC-SS", name: "Mỏ đá Sóc Sơn" },
  ],
};
