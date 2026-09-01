export const PAYMENT_STATUSES = ["DRAFT", "POSTED", "RECONCILED", "REVERSED"] as const;
export const PAYMENT_DIRECTIONS = ["RECEIPT", "DISBURSEMENT", "INTERNAL_TRANSFER"] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];
export type FinanceDocumentStatus = "OPEN" | "PARTIALLY_SETTLED" | "SETTLED" | "REVERSED";
export type FinancialAccountType = "CASH" | "BANK";

export interface WorkingCapitalSummary {
  asOfDate: string;
  receivables: string;
  overdueReceivables: string;
  payables: string;
  overduePayables: string;
  cashBalance: string;
  customerAdvances: string;
  supplierAdvances: string;
}

export interface FinancialAccountSummary {
  id: string;
  code: string;
  name: string;
  type: FinancialAccountType;
  currency: string;
  balance: string;
}

export interface FinanceDocumentSummary {
  id: string;
  number: string;
  partyId: string;
  partyName: string;
  sourceNumber: string;
  currency: string;
  originalAmount: string;
  outstandingAmount: string;
  dueDate: string;
  daysOverdue: number;
  status: FinanceDocumentStatus;
}

export interface PaymentSummary {
  id: string;
  number: string;
  direction: PaymentDirection;
  status: PaymentStatus;
  accountName: string;
  partyId: string | null;
  partyName: string;
  currency: string;
  amount: string;
  allocatedAmount: string;
  paymentDate: string;
  externalReference: string | null;
}

export interface AdvanceSummary {
  id: string;
  number: string;
  kind: "CUSTOMER" | "SUPPLIER";
  partyName: string;
  currency: string;
  originalAmount: string;
  remainingAmount: string;
  status: "OPEN" | "PARTIALLY_APPLIED" | "APPLIED" | "REVERSED";
}

export interface ExpenseSummary {
  id: string;
  number: string;
  accountName: string;
  category: string;
  description: string;
  currency: string;
  amount: string;
  expenseDate: string;
  status: "DRAFT" | "POSTED" | "REVERSED";
}

export interface BankTransactionSummary {
  id: string;
  accountId: string;
  accountName: string;
  externalId: string;
  transactionDate: string;
  amount: string;
  currency: string;
  description: string;
  status: "UNMATCHED" | "MATCHED";
}

export interface PartyOption {
  id: string;
  code: string;
  name: string;
}

export interface FinanceSnapshot {
  summary: WorkingCapitalSummary;
  accounts: FinancialAccountSummary[];
  receivables: FinanceDocumentSummary[];
  payables: FinanceDocumentSummary[];
  payments: PaymentSummary[];
  advances: AdvanceSummary[];
  expenses: ExpenseSummary[];
  bankTransactions: BankTransactionSummary[];
  customers: PartyOption[];
  suppliers: PartyOption[];
}

export type FinanceCommandKind =
  | "finance.account.create"
  | "finance.payment.create"
  | "finance.payment.allocate"
  | "finance.payment.post"
  | "finance.payment.reverse"
  | "finance.advance.apply"
  | "finance.expense.create"
  | "finance.expense.post"
  | "finance.expense.reverse"
  | "finance.adjustment.post"
  | "finance.adjustment.reverse"
  | "finance.bank.import"
  | "finance.payment.reconcile";
