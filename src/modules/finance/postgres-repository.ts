import { observeRead } from "@/lib/postgres/read-observability";
import "server-only";

import type { Sql, TransactionSql } from "postgres";

import type { FinanceCommandInput } from "@/modules/finance/commands";
import type {
  BankTransactionSummary,
  FinanceDocumentSummary,
  FinanceSnapshot,
  PaymentSummary,
} from "@/modules/finance/types";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";

async function databasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: Permission,
) {
  await observeRead("finance.permission", () => sql`select app_private.assert_actor_permission(${actorId}, ${permission})`);
}
function missing(message: string): never {
  throw new PlatformError(message, "FINANCE_RECORD_NOT_FOUND", 404);
}

interface SummaryRow {
  as_of_date: string;
  currency: string;
  receivables: string;
  overdue_receivables: string;
  payables: string;
  overdue_payables: string;
  cash_balance: string;
  customer_advances: string;
  supplier_advances: string;
}
interface AccountRow {
  id: string;
  account_code: string;
  account_name: string;
  account_type: "CASH" | "BANK";
  currency: string;
  balance: string;
}
interface DocumentRow {
  id: string;
  document_number: string;
  party_id: string;
  party_name: string;
  source_number: string;
  currency: string;
  original_amount: string;
  outstanding_amount: string;
  due_date: string;
  days_overdue: number;
  status: "OPEN" | "PARTIALLY_SETTLED" | "SETTLED" | "REVERSED";
}
interface PaymentRow {
  id: string;
  payment_number: string;
  direction: "RECEIPT" | "DISBURSEMENT" | "INTERNAL_TRANSFER";
  status: "DRAFT" | "POSTED" | "RECONCILED" | "REVERSED";
  account_name: string;
  party_id: string | null;
  party_name: string;
  currency: string;
  amount: string;
  allocated_amount: string;
  payment_date: string;
  external_reference: string | null;
}

function mapDocument(row: DocumentRow): FinanceDocumentSummary {
  return {
    id: row.id,
    number: row.document_number,
    partyId: row.party_id,
    partyName: row.party_name,
    sourceNumber: row.source_number,
    currency: row.currency,
    originalAmount: row.original_amount,
    outstandingAmount: row.outstanding_amount,
    dueDate: row.due_date,
    daysOverdue: Number(row.days_overdue),
    status: row.status,
  };
}

export async function readFinanceSnapshot(
  sql: Sql | TransactionSql,
  principal: Principal,
): Promise<FinanceSnapshot> {
  assertPermission(principal, "finance.read");
  await databasePermission(sql, principal.userId, "finance.read");
  const [
    summaryRows,
    accountRows,
    receivableRows,
    payableRows,
    paymentRows,
    customerAdvanceRows,
    supplierAdvanceRows,
    expenseRows,
    bankRows,
    customerRows,
    supplierRows,
    salesOrderRows,
    vehicleRows,
  ] = await Promise.all([
    observeRead("finance.readFinanceSnapshot.1", () => sql<SummaryRow[]>`select * from public.finance_working_capital_summary`),
    observeRead("finance.readFinanceSnapshot.2", () => sql<AccountRow[]>`
      select account.id, account.account_code, account.account_name, account.account_type,
        account.currency,
        coalesce(sum(case
          when movement.reversal_of_id is null and movement.movement_type in ('RECEIPT', 'TRANSFER_IN') then movement.amount
          when movement.reversal_of_id is null then -movement.amount
          when original.movement_type in ('RECEIPT', 'TRANSFER_IN') then -movement.amount
          else movement.amount end), 0)::text as balance
      from public.financial_accounts account
      left join public.financial_movements movement on movement.financial_account_id = account.id
      left join public.financial_movements original on original.id = movement.reversal_of_id
      where account.is_active
      group by account.id order by account.account_code`),
    observeRead("finance.readFinanceSnapshot.3", () => sql<DocumentRow[]>`
      select receivable.id, receivable.receivable_number as document_number,
        customer.id as party_id, customer.name_vi as party_name,
        coalesce(sales_order.sales_order_number, service_job.job_number) as source_number,
        receivable.currency,
        receivable.original_amount, receivable.outstanding_amount, receivable.due_date::text,
        greatest(current_date - receivable.due_date, 0) as days_overdue, receivable.status
      from public.receivables receivable
      join public.customers customer on customer.id = receivable.customer_id
      left join public.sales_orders sales_order on sales_order.id = receivable.sales_order_id
      left join public.service_jobs service_job on service_job.id = receivable.service_job_id
      order by receivable.due_date, receivable.created_at desc limit 200`),
    observeRead("finance.readFinanceSnapshot.4", () => sql<DocumentRow[]>`
      select payable.id, payable.payable_number as document_number,
        supplier.id as party_id, supplier.name_vi as party_name,
        purchase_order.purchase_order_number as source_number, payable.currency,
        payable.original_amount, payable.outstanding_amount, payable.due_date::text,
        greatest(current_date - payable.due_date, 0) as days_overdue, payable.status
      from public.payables payable
      join public.suppliers supplier on supplier.id = payable.supplier_id
      join public.purchase_orders purchase_order on purchase_order.id = payable.purchase_order_id
      order by payable.due_date, payable.created_at desc limit 200`),
    observeRead("finance.readFinanceSnapshot.5", () => sql<PaymentRow[]>`
      select payment.id, payment.payment_number, payment.direction, payment.status,
        account.account_name,
        coalesce(payment.customer_id, payment.supplier_id) as party_id,
        coalesce(customer.name_vi, supplier.name_vi, 'Chuyển giữa tài khoản') as party_name,
        payment.currency, payment.amount,
        coalesce(sum(allocation.amount) filter (where allocation.status <> 'REVERSED'), 0)::text as allocated_amount,
        payment.payment_date::text, payment.external_reference
      from public.payments payment
      join public.financial_accounts account on account.id = payment.financial_account_id
      left join public.customers customer on customer.id = payment.customer_id
      left join public.suppliers supplier on supplier.id = payment.supplier_id
      left join public.payment_allocations allocation on allocation.payment_id = payment.id
      group by payment.id, account.account_name, customer.name_vi, supplier.name_vi
      order by payment.payment_date desc, payment.created_at desc limit 200`),
    observeRead("finance.readFinanceSnapshot.6", () => sql<
      {
        id: string;
        advance_number: string;
        party_name: string;
        currency: string;
        original_amount: string;
        remaining_amount: string;
        status: "OPEN" | "PARTIALLY_APPLIED" | "APPLIED" | "REVERSED";
      }[]
    >`
      select advance.id, advance.advance_number, customer.name_vi as party_name,
        advance.currency, advance.original_amount, advance.remaining_amount, advance.status
      from public.customer_advances advance
      join public.customers customer on customer.id = advance.customer_id
      order by advance.created_at desc limit 100`),
    observeRead("finance.readFinanceSnapshot.7", () => sql<
      {
        id: string;
        advance_number: string;
        party_name: string;
        currency: string;
        original_amount: string;
        remaining_amount: string;
        status: "OPEN" | "PARTIALLY_APPLIED" | "APPLIED" | "REVERSED";
      }[]
    >`
      select advance.id, advance.advance_number, supplier.name_vi as party_name,
        advance.currency, advance.original_amount, advance.remaining_amount, advance.status
      from public.supplier_advances advance
      join public.suppliers supplier on supplier.id = advance.supplier_id
      order by advance.created_at desc limit 100`),
    observeRead("finance.readFinanceSnapshot.8", () => sql<
      {
        id: string;
        expense_number: string;
        account_name: string;
        category: string;
        description: string;
        currency: string;
        amount: string;
        expense_date: string;
        status: "DRAFT" | "POSTED" | "REVERSED";
        allocated_amount: string;
        allocated_percent: string;
        allocation_count: number;
      }[]
    >`
      select expense.id, expense.expense_number, account.account_name, expense.category,
        expense.description, expense.currency, expense.amount, expense.expense_date::text, expense.status,
        coalesce(sum(allocation.amount), 0)::text as allocated_amount,
        coalesce(sum(allocation.allocation_percent), 0)::text as allocated_percent,
        count(allocation.id)::integer as allocation_count
      from public.expenses expense
      join public.financial_accounts account on account.id = expense.financial_account_id
      left join public.expense_allocations allocation on allocation.expense_id = expense.id
      group by expense.id, account.account_name
      order by expense.expense_date desc, expense.created_at desc limit 100`),
    observeRead("finance.readFinanceSnapshot.9", () => sql<
      {
        id: string;
        financial_account_id: string;
        account_name: string;
        external_transaction_id: string;
        transaction_date: string;
        amount: string;
        currency: string;
        description: string;
        status: "UNMATCHED" | "MATCHED";
      }[]
    >`
      select transaction.id, transaction.financial_account_id, account.account_name,
        transaction.external_transaction_id, transaction.transaction_date::text,
        transaction.amount, transaction.currency, transaction.description, transaction.status
      from public.bank_transactions transaction
      join public.financial_accounts account on account.id = transaction.financial_account_id
      order by transaction.transaction_date desc, transaction.imported_at desc limit 100`),
    observeRead("finance.readFinanceSnapshot.10", () => sql<{ id: string; code: string; name_vi: string }[]>`
      select id, code, name_vi from public.customers where is_active order by name_vi`),
    observeRead("finance.readFinanceSnapshot.11", () => sql<{ id: string; code: string; name_vi: string }[]>`
      select id, code, name_vi from public.suppliers where is_active order by name_vi`),
    observeRead("finance.readFinanceSnapshot.12", () => sql<{ id: string; code: string; name_vi: string }[]>`
      select sales_order.id, sales_order.sales_order_number as code,
        customer.name_vi || ' · ' || sales_order.currency as name_vi
      from public.sales_orders sales_order
      join public.customers customer on customer.id = sales_order.customer_id
      where sales_order.status <> 'CANCELLED'
      order by sales_order.created_at desc limit 200`),
    observeRead("finance.readFinanceSnapshot.13", () => sql<{ id: string; code: string; name_vi: string }[]>`
      select id, plate_number as code, vehicle_type || ' · ' || plate_number as name_vi
      from public.vehicles where is_active order by plate_number`),
  ]);

  const fallbackSummary = {
    as_of_date: new Date().toISOString().slice(0, 10),
    receivables: "0",
    overdue_receivables: "0",
    payables: "0",
    overdue_payables: "0",
    cash_balance: "0",
    customer_advances: "0",
    supplier_advances: "0",
    currency: "VND",
  };
  const summary =
    summaryRows.find((row) => row.currency === "VND") ??
    summaryRows[0] ??
    fallbackSummary;
  const mapSummary = (row: SummaryRow) => ({
    asOfDate: row.as_of_date,
    currency: row.currency,
    receivables: row.receivables,
    overdueReceivables: row.overdue_receivables,
    payables: row.payables,
    overduePayables: row.overdue_payables,
    cashBalance: row.cash_balance,
    customerAdvances: row.customer_advances,
    supplierAdvances: row.supplier_advances,
  });
  return {
    summary: mapSummary(summary),
    summaries: summaryRows.length
      ? summaryRows.map(mapSummary)
      : [mapSummary(fallbackSummary)],
    accounts: accountRows.map((row) => ({
      id: row.id,
      code: row.account_code,
      name: row.account_name,
      type: row.account_type,
      currency: row.currency,
      balance: row.balance,
    })),
    receivables: receivableRows.map(mapDocument),
    payables: payableRows.map(mapDocument),
    payments: paymentRows.map((row): PaymentSummary => ({
      id: row.id,
      number: row.payment_number,
      direction: row.direction,
      status: row.status,
      accountName: row.account_name,
      partyId: row.party_id,
      partyName: row.party_name,
      currency: row.currency,
      amount: row.amount,
      allocatedAmount: row.allocated_amount,
      paymentDate: row.payment_date,
      externalReference: row.external_reference,
    })),
    advances: [
      ...customerAdvanceRows.map((row) => ({
        id: row.id,
        number: row.advance_number,
        kind: "CUSTOMER" as const,
        partyName: row.party_name,
        currency: row.currency,
        originalAmount: row.original_amount,
        remainingAmount: row.remaining_amount,
        status: row.status,
      })),
      ...supplierAdvanceRows.map((row) => ({
        id: row.id,
        number: row.advance_number,
        kind: "SUPPLIER" as const,
        partyName: row.party_name,
        currency: row.currency,
        originalAmount: row.original_amount,
        remainingAmount: row.remaining_amount,
        status: row.status,
      })),
    ],
    expenses: expenseRows.map((row) => ({
      id: row.id,
      number: row.expense_number,
      accountName: row.account_name,
      category: row.category,
      description: row.description,
      currency: row.currency,
      amount: row.amount,
      expenseDate: row.expense_date,
      status: row.status,
      allocatedAmount: row.allocated_amount,
      allocatedPercent: row.allocated_percent,
      allocationCount: Number(row.allocation_count),
    })),
    bankTransactions: bankRows.map((row): BankTransactionSummary => ({
      id: row.id,
      accountId: row.financial_account_id,
      accountName: row.account_name,
      externalId: row.external_transaction_id,
      transactionDate: row.transaction_date,
      amount: row.amount,
      currency: row.currency,
      description: row.description,
      status: row.status,
    })),
    customers: customerRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
    })),
    suppliers: supplierRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
    })),
    salesOrders: salesOrderRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
    })),
    vehicles: vehicleRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
    })),
  };
}

export async function executeFinanceCommand(
  sql: TransactionSql,
  principal: Principal,
  input: FinanceCommandInput,
) {
  switch (input.kind) {
    case "finance.account.create": {
      await databasePermission(sql, principal.userId, "finance.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.create_financial_account(
        ${input.accountCode}, ${input.accountName}, ${input.accountType}::public.financial_account_type,
        ${input.currency}, ${input.bankName}, ${input.maskedNumber}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không tạo được tài khoản tiền.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.payment.create": {
      await databasePermission(sql, principal.userId, "payment.create");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.create_payment(
        ${input.direction}::public.payment_direction, ${input.accountId}, ${input.destinationAccountId},
        ${input.customerId}, ${input.supplierId}, ${input.currency}, ${input.amount},
        ${input.paymentDate}, ${input.externalReference}, ${input.note}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không lập được khoản thu chi.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.payment.allocate": {
      await databasePermission(sql, principal.userId, "payment.allocate");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.allocate_payment(
        ${input.paymentId}, ${input.targetKind === "RECEIVABLE" ? input.targetId : null},
        ${input.targetKind === "PAYABLE" ? input.targetId : null}, ${input.amount}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không phân bổ được khoản thu chi.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.payment.post": {
      await databasePermission(sql, principal.userId, "payment.post");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.post_payment(${input.paymentId}, ${principal.userId}) as id`;
      if (!row) missing("Không ghi sổ được khoản thu chi.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.payment.reverse": {
      await databasePermission(sql, principal.userId, "payment.reverse");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.reverse_payment(${input.paymentId}, ${input.reason}, ${principal.userId}) as id`;
      if (!row) missing("Không hoàn tác được khoản thu chi.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.advance.apply": {
      await databasePermission(sql, principal.userId, "payment.allocate");
      const [row] =
        input.advanceKind === "CUSTOMER"
          ? await sql<
              { id: string }[]
            >`select app_private.apply_customer_advance(${input.advanceId}, ${input.targetId}, ${input.amount}, ${principal.userId}) as id`
          : await sql<
              { id: string }[]
            >`select app_private.apply_supplier_advance(${input.advanceId}, ${input.targetId}, ${input.amount}, ${principal.userId}) as id`;
      if (!row) missing("Không cấn trừ được tiền ứng trước.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.expense.create": {
      await databasePermission(sql, principal.userId, "expense.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.create_expense(
        ${input.accountId}, ${input.expenseDate}, ${input.category}, ${input.description},
        ${input.currency}, ${input.amount}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không lập được chi phí.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.expense.allocate": {
      await databasePermission(sql, principal.userId, "expense.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.allocate_expense(
        ${input.expenseId}, ${input.allocationDimension}, ${input.allocationReferenceId},
        ${input.allocationPercent}, ${input.directCostCategory}::public.direct_cost_category,
        ${input.reason}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không phân bổ được chi phí.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.expense.post": {
      await databasePermission(sql, principal.userId, "expense.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.post_expense(${input.expenseId}, ${principal.userId}) as id`;
      if (!row) missing("Không ghi sổ được chi phí.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.expense.reverse": {
      await databasePermission(sql, principal.userId, "expense.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.reverse_expense(${input.expenseId}, ${input.reason}, ${principal.userId}) as id`;
      if (!row) missing("Không hoàn tác được chi phí.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.adjustment.post": {
      const permission: Permission =
        input.targetKind === "RECEIVABLE"
          ? "receivable.adjust"
          : "payable.adjust";
      await databasePermission(sql, principal.userId, permission);
      const [row] = await sql<
        { id: string }[]
      >`select app_private.post_finance_adjustment(
        ${input.targetKind}::public.finance_adjustment_target, ${input.targetId},
        ${input.signedAmount}, ${input.reason}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không ghi được bút toán điều chỉnh.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.adjustment.reverse": {
      const [row] = await sql<
        { id: string }[]
      >`select app_private.reverse_finance_adjustment(
        ${input.adjustmentId}, ${input.reason}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không hoàn tác được bút toán điều chỉnh.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.bank.import": {
      await databasePermission(sql, principal.userId, "reconciliation.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.record_bank_transaction(
        ${input.accountId}, ${input.externalId}, ${input.transactionDate}, ${input.signedAmount},
        ${input.currency}, ${input.description}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không ghi được giao dịch ngân hàng.");
      return { id: row.id, kind: input.kind };
    }
    case "finance.payment.reconcile": {
      await databasePermission(sql, principal.userId, "reconciliation.manage");
      const [row] = await sql<
        { id: string }[]
      >`select app_private.reconcile_payment(
        ${input.paymentId}, ${input.bankTransactionId}, ${principal.userId}
      ) as id`;
      if (!row) missing("Không đối chiếu được khoản thu chi.");
      return { id: row.id, kind: input.kind };
    }
  }
}
