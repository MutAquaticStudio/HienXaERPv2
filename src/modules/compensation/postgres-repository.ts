import "server-only";

import type { JSONValue, TransactionSql } from "postgres";
import type { createClient } from "@/lib/supabase/server";

import type { CompensationCommandInput } from "@/modules/compensation/commands";
import {
  assertPermission,
  hasPermission,
} from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Principal } from "@/modules/platform/types";
import type {
  CompensationPlanSummary,
  CompensationRuleSummary,
  CompensationSnapshot,
  EarningAllocationSummary,
  EarningEventSummary,
  MyEarningsSnapshot,
  PayrollLineSummary,
  PayrollPeriodSummary,
} from "@/modules/compensation/types";
import type { RoleTemplate } from "@/modules/platform/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type Row = Record<string, unknown>;

function readFailed(): never {
  throw new PlatformError(
    "Chưa đọc được dữ liệu thu nhập. Hãy thử tải lại.",
    "COMPENSATION_READ_FAILED",
    503,
  );
}

function text(value: unknown, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function mapAllocation(row: Row): EarningAllocationSummary {
  return {
    id: text(row.id),
    workerUserId: text(row.worker_user_id),
    workerName: text(row.worker_name),
    employeeCode: text(row.employee_code),
    planLabel: text(row.plan_label_snapshot),
    ruleType: row.rule_type_snapshot as EarningAllocationSummary["ruleType"],
    rateSnapshot: text(row.rate_snapshot, "0"),
    unitsSnapshot: text(row.approved_units_snapshot, "0"),
    sharePercent: text(row.share_percent, "0"),
    baseAmount: text(row.base_amount, "0"),
    adjustmentAmount: text(row.adjustment_amount, "0"),
    netAmount: text(row.net_amount, "0"),
  };
}

function mapPayrollLine(row: Row): PayrollLineSummary {
  return {
    id: text(row.id),
    employeeUserId: text(row.employee_user_id),
    employeeName: text(row.employee_name_snapshot),
    employeeCode: text(row.employee_code_snapshot),
    baseAmount: text(row.base_amount, "0"),
    adjustmentAmount: text(row.adjustment_amount, "0"),
    netAmount: text(row.net_amount, "0"),
    paidAmount: text(row.paid_amount, "0"),
    paymentStatus: row.payment_status as PayrollLineSummary["paymentStatus"],
  };
}

export async function readCompensationSnapshot(
  supabase: SupabaseServerClient,
  principal: Principal,
): Promise<CompensationSnapshot> {
  assertPermission(principal, "compensation.read");
  const paymentQuery = hasPermission(principal, "payment.read")
    ? supabase
        .from("compensation_payment_option_view")
        .select("*")
        .order("payment_date", { ascending: false })
        .limit(100)
    : Promise.resolve({ data: [], error: null });
  const [
    profileResult,
    planResult,
    eventResult,
    allocationResult,
    verifiedResult,
    periodResult,
    lineResult,
    workerResult,
    paymentResult,
  ] = await Promise.all([
    supabase
      .from("compensation_profile_view")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabase
      .from("compensation_plan_rule_view")
      .select("*")
      .order("effective_from", { ascending: false }),
    supabase
      .from("earning_event_summary_view")
      .select("*")
      .order("earned_on", { ascending: false })
      .limit(200),
    supabase
      .from("earning_allocation_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("verified_work_compensation_view")
      .select("*")
      .eq("has_earning", false)
      .order("verified_at", { ascending: false })
      .limit(100),
    supabase
      .from("payroll_period_summary_view")
      .select("*")
      .order("period_start", { ascending: false })
      .limit(50),
    supabase
      .from("payroll_line_summary_view")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("workforce_worker_view")
      .select("user_id, display_name, employee_code, roles")
      .order("display_name"),
    paymentQuery,
  ]);
  if (
    [
      profileResult.error,
      planResult.error,
      eventResult.error,
      allocationResult.error,
      verifiedResult.error,
      periodResult.error,
      lineResult.error,
      workerResult.error,
      paymentResult.error,
    ].some(Boolean)
  )
    readFailed();

  const planRows = (planResult.data ?? []) as Row[];
  const plans = new Map<string, CompensationPlanSummary>();
  const rules: CompensationRuleSummary[] = [];
  for (const row of planRows) {
    const planId = text(row.id);
    if (!plans.has(planId)) {
      plans.set(planId, {
        id: planId,
        planCode: text(row.plan_code),
        name: text(row.name),
        versionNumber: Number(row.version_number),
        scopeType: row.scope_type as CompensationPlanSummary["scopeType"],
        roleCode:
          (row.role_code as CompensationPlanSummary["roleCode"]) ?? null,
        employeeUserId: row.employee_user_id
          ? text(row.employee_user_id)
          : null,
        employeeName: row.employee_name ? text(row.employee_name) : null,
        effectiveFrom: text(row.effective_from),
        effectiveTo: row.effective_to ? text(row.effective_to) : null,
        currency: text(row.currency),
        ruleCount: Number(row.rule_count ?? 0),
      });
    }
    if (row.rule_id) {
      rules.push({
        id: text(row.rule_id),
        planVersionId: planId,
        planLabel: `${text(row.name)} · v${text(row.version_number)}`,
        ruleType: row.rule_type as CompensationRuleSummary["ruleType"],
        rate: text(row.rate, "0"),
        workType: row.work_type ? text(row.work_type) : null,
        sourceType: row.source_type ? text(row.source_type) : null,
        description: text(row.description),
      });
    }
  }

  const allocationRows = (allocationResult.data ?? []) as Row[];
  const allocationsByEvent = new Map<string, EarningAllocationSummary[]>();
  for (const row of allocationRows) {
    const eventId = text(row.earning_event_id);
    allocationsByEvent.set(eventId, [
      ...(allocationsByEvent.get(eventId) ?? []),
      mapAllocation(row),
    ]);
  }
  const lineRows = (lineResult.data ?? []) as Row[];
  const linesByPeriod = new Map<string, PayrollLineSummary[]>();
  for (const row of lineRows) {
    const periodId = text(row.payroll_period_id);
    linesByPeriod.set(periodId, [
      ...(linesByPeriod.get(periodId) ?? []),
      mapPayrollLine(row),
    ]);
  }

  return {
    profiles: ((profileResult.data ?? []) as Row[]).map((row) => ({
      employeeUserId: text(row.employee_user_id),
      displayName: text(row.display_name),
      employeeCode: text(row.employee_code),
      effectiveFrom: text(row.effective_from),
      effectiveTo: row.effective_to ? text(row.effective_to) : null,
      isActive: Boolean(row.is_active),
    })),
    plans: [...plans.values()],
    rules,
    verifiedWork: ((verifiedResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id),
      workNumber: text(row.work_number),
      title: text(row.title),
      workType: text(row.work_type),
      sourceType: text(row.source_type),
      sourceId: text(row.source_id),
      workerUserId: text(row.worker_user_id),
      workerName: text(row.worker_name),
      verifiedAt: text(row.verified_at),
    })),
    events: ((eventResult.data ?? []) as Row[]).map(
      (row): EarningEventSummary => ({
        id: text(row.id),
        eventNumber: text(row.event_number),
        sourceType: row.source_type as EarningEventSummary["sourceType"],
        sourceNumber: text(row.source_number_snapshot),
        description: text(row.description_snapshot),
        status: row.status as EarningEventSummary["status"],
        earnedOn: text(row.earned_on),
        currency: text(row.currency),
        basisQuantity: text(row.basis_quantity, "0"),
        basisLabel: text(row.basis_label_snapshot),
        totalAmount: text(row.total_amount, "0"),
        allocations: allocationsByEvent.get(text(row.id)) ?? [],
        approvedAt: row.approved_at ? text(row.approved_at) : null,
      }),
    ),
    periods: ((periodResult.data ?? []) as Row[]).map(
      (row): PayrollPeriodSummary => ({
        id: text(row.id),
        periodCode: text(row.period_code),
        periodStart: text(row.period_start),
        periodEnd: text(row.period_end),
        currency: text(row.currency),
        status: row.status as PayrollPeriodSummary["status"],
        totalEntitlement: text(row.total_entitlement, "0"),
        totalPaid: text(row.total_paid, "0"),
        lineCount: Number(row.line_count ?? 0),
        lines: linesByPeriod.get(text(row.id)) ?? [],
      }),
    ),
    workers: ((workerResult.data ?? []) as Row[]).map((row) => ({
      userId: text(row.user_id),
      displayName: text(row.display_name),
      employeeCode: text(row.employee_code),
      roles: (row.roles ?? []) as RoleTemplate[],
    })),
    payments: ((paymentResult.data ?? []) as Row[]).map((row) => ({
      id: text(row.id),
      number: text(row.payment_number),
      amount: text(row.amount, "0"),
      currency: text(row.currency),
      paymentDate: text(row.payment_date),
      availableAmount: text(row.available_amount, "0"),
    })),
  };
}

export async function readMyEarningsSnapshot(
  supabase: SupabaseServerClient,
  principal: Principal,
): Promise<MyEarningsSnapshot> {
  assertPermission(principal, "earning.read_self");
  const [earningResult, totalResult] = await Promise.all([
    supabase
      .from("my_earning_view")
      .select("*")
      .eq("worker_user_id", principal.userId)
      .order("earned_on", { ascending: false })
      .limit(200),
    supabase
      .from("worker_productivity_view")
      .select("*")
      .eq("worker_user_id", principal.userId)
      .maybeSingle(),
  ]);
  if (earningResult.error || totalResult.error) readFailed();
  const total = (totalResult.data ?? {}) as Row;
  return {
    earnings: ((earningResult.data ?? []) as Row[]).map((row) => ({
      allocationId: text(row.allocation_id),
      eventNumber: text(row.event_number),
      sourceNumber: text(row.source_number_snapshot),
      description: text(row.description_snapshot),
      status: row.status as MyEarningsSnapshot["earnings"][number]["status"],
      earnedOn: text(row.earned_on),
      ruleType:
        row.rule_type_snapshot as MyEarningsSnapshot["earnings"][number]["ruleType"],
      rateSnapshot: text(row.rate_snapshot, "0"),
      unitsSnapshot: text(row.approved_units_snapshot, "0"),
      currency: text(row.currency, "VND"),
      baseAmount: text(row.base_amount, "0"),
      adjustmentAmount: text(row.adjustment_amount, "0"),
      netAmount: text(row.net_amount, "0"),
      paidAmount: text(row.paid_amount, "0"),
    })),
    verifiedJobs: Number(total.verified_jobs ?? 0),
    approvedAmount: text(total.approved_amount, "0"),
    pendingAmount: text(total.pending_amount, "0"),
    paidAmount: text(total.paid_amount, "0"),
    currency: text(total.currency, "VND"),
  };
}

export async function executeCompensationCommand(
  sql: TransactionSql,
  principal: Principal,
  input: CompensationCommandInput,
) {
  let rows: { id: string }[] = [];
  switch (input.kind) {
    case "compensation.profile.create":
      rows =
        await sql`select app_private.create_compensation_profile(${input.employeeUserId}, ${input.effectiveFrom}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "compensation.plan.create":
      rows =
        await sql`select app_private.create_compensation_plan_version(${input.planCode}, ${input.name}, ${input.versionNumber}, ${input.scopeType}::public.compensation_plan_scope, ${input.roleCode}, ${input.employeeUserId}, ${input.effectiveFrom}, ${input.effectiveTo}, ${input.currency}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "compensation.rule.create":
      rows =
        await sql`select app_private.create_compensation_rule(${input.planVersionId}, ${input.ruleType}::public.compensation_rule_type, ${input.rate}, ${input.workType}, ${input.sourceType}, ${input.description}, ${principal.userId}) as id`;
      break;
    case "earning.create_from_work":
      rows =
        await sql`select app_private.create_verified_work_earning(${input.workItemId}, ${input.ruleType}::public.compensation_rule_type, ${sql.json(input.allocations as unknown as JSONValue)}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "earning.bonus":
      rows =
        await sql`select app_private.create_bonus_earning(${input.employeeUserId}, ${input.earnedOn}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "earning.approve":
      rows =
        await sql`select app_private.approve_earning_event(${input.earningEventId}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "earning.adjust":
      rows =
        await sql`select app_private.adjust_earning_allocation(${input.earningAllocationId}, ${input.amount}, ${input.reason}, ${principal.userId}) as id`;
      break;
    case "earning.reverse":
      rows =
        await sql`select app_private.reverse_earning_event(${input.earningEventId}, ${input.reason}, ${principal.userId}) as id`;
      break;
    case "payroll.period.create":
      rows =
        await sql`select app_private.create_payroll_period(${input.periodCode}, ${input.periodStart}, ${input.periodEnd}, ${input.currency}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "payroll.monthly.generate":
      rows =
        await sql`select app_private.generate_monthly_earnings(${input.payrollPeriodId}, ${principal.userId})::text as id`;
      break;
    case "payroll.close":
      rows =
        await sql`select app_private.close_payroll_period(${input.payrollPeriodId}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "payroll.payment.link":
      rows =
        await sql`select app_private.link_payroll_payment(${input.payrollLineId}, ${input.paymentId}, ${input.amount}, ${input.note}, ${principal.userId}) as id`;
      break;
  }
  return { id: rows[0]?.id ?? input.kind, kind: input.kind };
}
