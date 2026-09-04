import "server-only";

import type { TransactionSql } from "postgres";
import type { createClient } from "@/lib/supabase/server";

import type { ServiceJobCommandInput } from "@/modules/service-jobs/commands";
import { assertPermission } from "@/modules/platform/authorization";
import { PlatformError } from "@/modules/platform/errors";
import type { Principal } from "@/modules/platform/types";
import type {
  ServiceJobSnapshot,
  ServiceJobSummary,
  ServiceLogType,
  ServiceRateType,
  ServiceWorkLog,
} from "@/modules/service-jobs/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

interface JobRow {
  id: string;
  job_number: string;
  customer_id?: string;
  customer_site_id?: string;
  service_type_id?: string;
  machine_id?: string;
  customer_name_snapshot: string;
  site_name_snapshot: string;
  site_address_snapshot: string;
  service_type_name_snapshot: string;
  machine_name_snapshot: string;
  status: ServiceJobSummary["status"];
  scheduled_start_at: string;
  scheduled_end_at: string;
  started_at: string | null;
  ended_at: string | null;
  break_minutes: number;
  actual_minutes: number;
  actual_hours: string;
  approved_billable_hours?: string | null;
  approved_billable_quantity?: string | null;
  rate_type: ServiceRateType;
  unit_rate?: string;
  currency?: string;
  approval_note?: string | null;
  notes: string | null;
  operator_user_id: string | null;
  operator_name?: string | null;
  actual_cost?: string;
  recognized_revenue?: string;
  contribution_profit?: string;
  is_assigned_operator: boolean;
}
interface LogRow {
  id: string;
  service_job_id: string;
  log_type: ServiceLogType;
  occurred_at: string;
  note: string | null;
  fuel_liters: string | null;
  fuel_unit_cost: string | null;
  evidence_id: string | null;
}

function mapJob(row: JobRow): ServiceJobSummary {
  return {
    id: row.id,
    jobNumber: row.job_number,
    customerId: row.customer_id ?? "",
    customerSiteId: row.customer_site_id ?? "",
    serviceTypeId: row.service_type_id ?? "",
    machineId: row.machine_id ?? "",
    customerName: row.customer_name_snapshot,
    siteName: row.site_name_snapshot,
    siteAddress: row.site_address_snapshot,
    serviceTypeName: row.service_type_name_snapshot,
    machineName: row.machine_name_snapshot,
    status: row.status,
    scheduledStartAt: row.scheduled_start_at,
    scheduledEndAt: row.scheduled_end_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    breakMinutes: Number(row.break_minutes),
    actualMinutes: Number(row.actual_minutes),
    actualHours: String(row.actual_hours ?? "0"),
    approvedBillableHours: row.approved_billable_hours ?? null,
    approvedBillableQuantity: row.approved_billable_quantity ?? null,
    rateType: row.rate_type,
    unitRate: String(row.unit_rate ?? "0"),
    currency: row.currency ?? "VND",
    approvalNote: row.approval_note ?? null,
    notes: row.notes,
    operatorUserId: row.operator_user_id,
    operatorName: row.operator_name ?? null,
    actualCost: String(row.actual_cost ?? "0"),
    recognizedRevenue: String(row.recognized_revenue ?? "0"),
    contributionProfit: String(row.contribution_profit ?? "0"),
    isAssignedOperator: row.is_assigned_operator,
  };
}

function mapLog(row: LogRow): ServiceWorkLog {
  return {
    id: row.id,
    serviceJobId: row.service_job_id,
    logType: row.log_type,
    occurredAt: row.occurred_at,
    note: row.note,
    fuelLiters: row.fuel_liters,
    fuelUnitCost: row.fuel_unit_cost,
    evidenceId: row.evidence_id,
  };
}

function readFailed(): never {
  throw new PlatformError(
    "Chưa đọc được dữ liệu dịch vụ. Hãy thử tải lại.",
    "SERVICE_JOB_READ_FAILED",
    503,
  );
}

export async function readServiceJobSnapshot(
  supabase: SupabaseServerClient,
  principal: Principal,
  view: "office" | "worker",
): Promise<ServiceJobSnapshot> {
  if (view === "office") assertPermission(principal, "service_job.read");
  else assertPermission(principal, "service_job.update_assigned");

  const jobsQuery = supabase
    .from(
      view === "office"
        ? "service_job_operational_view"
        : "service_job_worker_view",
    )
    .select("*")
    .order("scheduled_start_at", { ascending: false })
    .limit(200);
  const logsQuery = supabase
    .from("service_job_log_view")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(500);
  const evidenceQuery = supabase
    .from("evidence")
    .select("id, storage_path")
    .eq("owner_user_id", principal.userId)
    .eq("entity_type", "SERVICE_JOB")
    .order("created_at", { ascending: false })
    .limit(100);

  if (view === "worker") {
    const [jobResult, logResult, evidenceResult] = await Promise.all([
      jobsQuery,
      logsQuery,
      evidenceQuery,
    ]);
    if (jobResult.error || logResult.error || evidenceResult.error)
      readFailed();
    return {
      jobs: ((jobResult.data ?? []) as JobRow[]).map(mapJob),
      logs: ((logResult.data ?? []) as LogRow[]).map(mapLog),
      serviceTypes: [],
      machines: [],
      customers: [],
      sites: [],
      operators: [],
      warehouses: [],
      evidence: (evidenceResult.data ?? []).map((row) => ({
        id: row.id,
        label: row.storage_path,
      })),
    };
  }

  const [
    jobResult,
    logResult,
    typeResult,
    machineResult,
    customerResult,
    siteResult,
    operatorResult,
    warehouseResult,
    evidenceResult,
  ] = await Promise.all([
    jobsQuery,
    logsQuery,
    supabase
      .from("service_types")
      .select(
        "id, code, name_vi, default_rate_type, default_unit_rate, standard_shift_hours",
      )
      .eq("is_active", true)
      .order("code"),
    supabase
      .from("service_machines")
      .select(
        "id, code, name_vi, machine_type, serial_number, status, meter_hours",
      )
      .neq("status", "INACTIVE")
      .order("code"),
    supabase
      .from("customers")
      .select("id, code, name_vi")
      .eq("is_active", true)
      .order("name_vi"),
    supabase
      .from("customer_sites")
      .select("id, customer_id, name_vi, address")
      .eq("is_active", true)
      .order("name_vi"),
    supabase
      .from("workforce_worker_view")
      .select("user_id, display_name, employee_code, roles")
      .order("display_name"),
    supabase
      .from("warehouses")
      .select("id, code, name_vi")
      .eq("is_active", true)
      .order("code"),
    evidenceQuery,
  ]);
  if (
    [
      jobResult.error,
      logResult.error,
      typeResult.error,
      machineResult.error,
      customerResult.error,
      siteResult.error,
      operatorResult.error,
      warehouseResult.error,
      evidenceResult.error,
    ].some(Boolean)
  )
    readFailed();
  return {
    jobs: ((jobResult.data ?? []) as JobRow[]).map(mapJob),
    logs: ((logResult.data ?? []) as LogRow[]).map(mapLog),
    serviceTypes: (typeResult.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
      defaultRateType: row.default_rate_type as ServiceRateType,
      defaultUnitRate: row.default_unit_rate,
      standardShiftHours: row.standard_shift_hours,
    })),
    machines: (machineResult.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
      machineType: row.machine_type,
      serialNumber: row.serial_number,
      status: row.status as ServiceJobSnapshot["machines"][number]["status"],
      meterHours: row.meter_hours,
    })),
    customers: (customerResult.data ?? []).map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name_vi,
    })),
    sites: (siteResult.data ?? []).map((row) => ({
      id: row.id,
      customerId: row.customer_id,
      name: row.name_vi,
      address: row.address,
    })),
    operators: (operatorResult.data ?? [])
      .filter((row) => (row.roles as string[]).includes("OPERATOR_WORKER"))
      .map((row) => ({
        userId: row.user_id,
        displayName: row.display_name,
        employeeCode: row.employee_code,
      })),
    warehouses: (warehouseResult.data ?? []).map((row) => ({
      id: row.id,
      label: `${row.code} · ${row.name_vi}`,
    })),
    evidence: (evidenceResult.data ?? []).map((row) => ({
      id: row.id,
      label: row.storage_path,
    })),
  };
}

export async function executeServiceJobCommand(
  sql: TransactionSql,
  principal: Principal,
  input: ServiceJobCommandInput,
) {
  let rows: { id: string }[] = [];
  switch (input.kind) {
    case "service.type.create":
      rows =
        await sql`select app_private.create_service_type(${input.code}, ${input.name}, ${input.rateType}::public.service_rate_type, ${input.unitRate}, ${input.standardShiftHours}, ${principal.userId}) as id`;
      break;
    case "service.machine.create":
      rows =
        await sql`select app_private.create_service_machine(${input.code}, ${input.name}, ${input.machineType}, ${input.serialNumber}, ${input.warehouseId}, ${input.meterHours}, ${principal.userId}) as id`;
      break;
    case "service.job.create":
      rows =
        await sql`select app_private.create_service_job(${input.customerId}, ${input.customerSiteId}, ${input.serviceTypeId}, ${input.machineId}, ${input.scheduledStartAt}, ${input.scheduledEndAt}, ${input.rateType}::public.service_rate_type, ${input.unitRate}, ${input.currency}, ${input.notes}, ${principal.userId}) as id`;
      break;
    case "service.job.assign":
      rows =
        await sql`select app_private.assign_service_job(${input.serviceJobId}, ${input.operatorUserId}, ${principal.userId}) as id`;
      break;
    case "service.job.log":
      rows =
        await sql`select app_private.record_service_work_log(${input.serviceJobId}, ${input.logType}::public.service_work_log_type, ${input.occurredAt}, ${input.note}, ${input.fuelLiters}, ${input.fuelUnitCost}, ${input.evidenceId}, ${principal.userId}) as id`;
      break;
    case "service.job.approve":
      rows =
        await sql`select app_private.approve_service_job_billing(${input.serviceJobId}, ${input.approvedBillableHours}, ${input.approvedBillableQuantity}, ${input.note}, ${principal.userId}) as id`;
      break;
    case "service.job.cost":
      rows =
        await sql`select app_private.record_service_job_cost(${input.serviceJobId}, ${input.category}::public.service_cost_category, ${input.amount}, ${input.note}, ${input.occurredAt}, ${principal.userId}) as id`;
      break;
    case "service.job.confirm":
      rows =
        await sql`select app_private.confirm_service_job_customer(${input.serviceJobId}, ${input.customerRepresentative}, ${input.confirmationNote}, ${input.signatureEvidenceId}, ${principal.userId}) as id`;
      break;
    case "service.job.cancel":
      rows =
        await sql`select app_private.cancel_service_job(${input.serviceJobId}, ${input.reason}, ${principal.userId}) as id`;
      break;
  }
  return { id: rows[0]?.id ?? input.kind, kind: input.kind };
}
