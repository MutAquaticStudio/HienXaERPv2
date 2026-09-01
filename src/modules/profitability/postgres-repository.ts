import "server-only";

import type { Sql, TransactionSql } from "postgres";

import type { ProfitabilityCommandInput } from "@/modules/profitability/commands";
import type {
  DirectCostWaterfallItem,
  OrderProfitabilitySummary,
  ProfitabilityDimensionSummary,
  ProfitabilitySnapshot,
} from "@/modules/profitability/types";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Permission, Principal } from "@/modules/platform/types";

async function databasePermission(
  sql: Sql | TransactionSql,
  actorId: string,
  permission: Permission,
) {
  await sql`select app_private.assert_actor_permission(${actorId}, ${permission})`;
}

interface CenterRow {
  as_of_date: string;
  currency: string;
  revenue: string;
  contribution_profit: string;
  actual_margin_percent: string | null;
  receivables: string;
  payables: string;
  cash_balance: string;
  working_capital: string;
  estimated_count: number;
  actual_open_count: number;
  finalized_count: number;
}
interface OrderRow {
  id: string;
  sales_order_id: string;
  sales_order_number: string;
  customer_id: string;
  customer_name: string;
  currency: string;
  lifecycle: OrderProfitabilitySummary["lifecycle"];
  quoted_revenue: string;
  committed_revenue: string;
  actual_revenue: string;
  quoted_direct_cost: string;
  committed_direct_cost: string;
  actual_direct_cost: string;
  quoted_contribution_profit: string;
  committed_contribution_profit: string;
  actual_contribution_profit: string;
  quoted_margin_percent: string | null;
  committed_margin_percent: string | null;
  actual_margin_percent: string | null;
  margin_variance_points: string | null;
  primary_material: string;
  primary_supplier: string;
  vehicle_plate: string;
}

export async function readProfitabilitySnapshot(
  sql: Sql,
  principal: Principal,
): Promise<ProfitabilitySnapshot> {
  assertPermission(principal, "margin.read");
  await databasePermission(sql, principal.userId, "margin.read");
  const [centerRows, orderRows, costRows, dimensionRows] = await Promise.all([
    sql<CenterRow[]>`select * from public.profitability_command_center`,
    sql<
      OrderRow[]
    >`select * from public.profitability_order_summary order by updated_at desc limit 200`,
    sql<
      {
        category: DirectCostWaterfallItem["category"];
        basis: DirectCostWaterfallItem["basis"];
        amount: string;
        currency: string;
      }[]
    >`
      select category, basis, amount, currency from public.profitability_direct_cost_waterfall
      order by basis, amount desc`,
    sql<
      {
        dimension: ProfitabilityDimensionSummary["dimension"];
        dimension_id: string;
        dimension_name: string;
        currency: string;
        revenue: string;
        direct_cost: string;
        contribution_profit: string;
      }[]
    >`
      select dimension, dimension_id, dimension_name, currency, revenue, direct_cost, contribution_profit
      from public.profitability_dimension_summary order by dimension, contribution_profit desc limit 300`,
  ]);
  const fallbackCenter: CenterRow = {
    as_of_date: new Date().toISOString().slice(0, 10),
    currency: "VND",
    revenue: "0",
    contribution_profit: "0",
    actual_margin_percent: null,
    receivables: "0",
    payables: "0",
    cash_balance: "0",
    working_capital: "0",
    estimated_count: 0,
    actual_open_count: 0,
    finalized_count: 0,
  };
  return {
    commandCenters: (centerRows.length ? centerRows : [fallbackCenter]).map(
      (center) => ({
        asOfDate: center.as_of_date,
        currency: center.currency,
        revenue: center.revenue,
        contributionProfit: center.contribution_profit,
        actualMarginPercent: center.actual_margin_percent,
        receivables: center.receivables,
        payables: center.payables,
        cashBalance: center.cash_balance,
        workingCapital: center.working_capital,
        estimatedCount: Number(center.estimated_count),
        actualOpenCount: Number(center.actual_open_count),
        finalizedCount: Number(center.finalized_count),
      }),
    ),
    orders: orderRows.map((row) => ({
      id: row.id,
      salesOrderId: row.sales_order_id,
      salesOrderNumber: row.sales_order_number,
      customerId: row.customer_id,
      customerName: row.customer_name,
      currency: row.currency,
      lifecycle: row.lifecycle,
      quotedRevenue: row.quoted_revenue,
      committedRevenue: row.committed_revenue,
      actualRevenue: row.actual_revenue,
      quotedDirectCost: row.quoted_direct_cost,
      committedDirectCost: row.committed_direct_cost,
      actualDirectCost: row.actual_direct_cost,
      quotedContributionProfit: row.quoted_contribution_profit,
      committedContributionProfit: row.committed_contribution_profit,
      actualContributionProfit: row.actual_contribution_profit,
      quotedMarginPercent: row.quoted_margin_percent,
      committedMarginPercent: row.committed_margin_percent,
      actualMarginPercent: row.actual_margin_percent,
      marginVariancePoints: row.margin_variance_points,
      primaryMaterial: row.primary_material,
      primarySupplier: row.primary_supplier,
      vehiclePlate: row.vehicle_plate,
    })),
    costWaterfall: costRows,
    dimensions: dimensionRows.map((row) => ({
      dimension: row.dimension,
      dimensionId: row.dimension_id,
      dimensionName: row.dimension_name,
      currency: row.currency,
      revenue: row.revenue,
      directCost: row.direct_cost,
      contributionProfit: row.contribution_profit,
    })),
  };
}

export async function executeProfitabilityCommand(
  sql: TransactionSql,
  principal: Principal,
  input: ProfitabilityCommandInput,
) {
  await databasePermission(sql, principal.userId, "profitability.manage");
  if (input.kind === "profitability.cost.record") {
    const [row] = await sql<
      { id: string }[]
    >`select app_private.record_profitability_direct_cost(
      ${input.salesOrderId}, ${input.basis}::public.profitability_basis,
      ${input.category}::public.direct_cost_category, ${input.amount}, ${input.materialId},
      ${input.supplierId}, ${input.vehicleId}, ${input.serviceReferenceId},
      ${input.expenseAllocationId}, ${input.reason}, ${input.occurredAt}, ${principal.userId}
    ) as id`;
    if (!row)
      throw new PlatformError(
        "Không ghi được chi phí trực tiếp.",
        "PROFITABILITY_RECORD_NOT_FOUND",
        404,
      );
    return { id: row.id, kind: input.kind };
  }
  if (input.kind === "profitability.revenue.allocate") {
    const [row] = await sql<{ id: string }[]>`
      select app_private.record_profitability_revenue_allocation(
        ${input.salesOrderId}, ${input.serviceReferenceId}, ${input.amount},
        ${input.reason}, ${principal.userId}
      ) as id`;
    if (!row) {
      throw new PlatformError(
        "Không phân bổ được doanh thu dịch vụ.",
        "PROFITABILITY_RECORD_NOT_FOUND",
        404,
      );
    }
    return { id: row.id, kind: input.kind };
  }
  const functionName =
    input.kind === "profitability.finalize"
      ? "finalize_order_profitability"
      : "reopen_order_profitability";
  const [row] =
    functionName === "finalize_order_profitability"
      ? await sql<
          { id: string }[]
        >`select app_private.finalize_order_profitability(
        ${input.salesOrderId}, ${input.reason}, ${principal.userId}
      ) as id`
      : await sql<
          { id: string }[]
        >`select app_private.reopen_order_profitability(
        ${input.salesOrderId}, ${input.reason}, ${principal.userId}
      ) as id`;
  if (!row)
    throw new PlatformError(
      "Không cập nhật được vòng đời lợi nhuận.",
      "PROFITABILITY_RECORD_NOT_FOUND",
      404,
    );
  return { id: row.id, kind: input.kind };
}
