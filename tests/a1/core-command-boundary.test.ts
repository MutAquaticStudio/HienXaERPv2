import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function migration(suffix: string) {
  const directory = join(process.cwd(), "supabase/migrations");
  const name = readdirSync(directory).find((item) => item.endsWith(suffix));
  expect(name).toBeTruthy();
  return readFileSync(join(directory, name as string), "utf8");
}

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function app_private.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe("A1 cross-flow command boundary", () => {
  it("moves CP1 quotation acceptance onto a canonical P4 transition", () => {
    const sql = migration("_a1_core_command_boundaries.sql");
    const coreAcceptance = functionBody(sql, "accept_quotation(");
    const portalAcceptance = functionBody(sql, "customer_portal_accept_quotation(");

    expect(coreAcceptance).toContain("security invoker");
    expect(coreAcceptance).toContain("QUOTATION_REVISION_NOT_ACTIVE");
    expect(coreAcceptance).toContain("update public.quotation_revisions");
    expect(coreAcceptance).toContain("update public.quotations");
    expect(portalAcceptance).toContain("app_private.customer_portal_customer_id(p_actor_id)");
    expect(portalAcceptance).toContain("target_quotation.active_revision_id <> p_revision_id");
    expect(portalAcceptance).toContain("perform app_private.accept_quotation(p_revision_id, p_actor_id)");
    expect(portalAcceptance).not.toMatch(/update\s+public\.(quotation_revisions|quotations)\b/i);
  });

  it("keeps every completed add-on adapter from replacing core delivery, finance, work, or service truth", () => {
    const route = migration("_ro1_route_optimization.sql");
    const gps = migration("_gps1_active_delivery_gps.sql");
    const chat = migration("_chat1_operational_chat.sql");
    const cp1 = migration("_cp1_customer_portal.sql");
    const wp1 = migration("_wp1_worker_portal_support.sql");
    const compensation = migration("_p12_compensation_productivity.sql");

    const routeApply = functionBody(route, "apply_route_plan(");
    expect(routeApply).toContain("app_private.assign_delivery(");
    expect(routeApply).toContain("POOL_CLAIM_REQUIRES_EXPLICIT_WORKFLOW");
    expect(routeApply).not.toMatch(/(insert\s+into\s+public\.delivery_assignments|update\s+public\.deliveries)\b/i);

    const gpsRecord = functionBody(gps, "record_active_delivery_location(");
    expect(gpsRecord).toContain("GPS_ACTIVE_DELIVERY_REQUIRED");
    expect(gpsRecord).not.toMatch(/(update\s+public\.deliveries|confirm_delivery\()\b/i);

    const paymentNotice = functionBody(cp1, "customer_portal_submit_payment_notice(");
    expect(paymentNotice).not.toMatch(/(insert\s+into|update\s+public\.)\s+(payments|payment_allocations|receivables)\b/i);

    const issue = functionBody(wp1, "report_portal_issue(");
    expect(issue).not.toMatch(/(update|insert\s+into)\s+public\.(deliveries|sales_orders|receivables|payments)\b/i);

    const message = functionBody(chat, "send_operational_message(");
    expect(message).not.toMatch(/(update|insert\s+into)\s+public\.(deliveries|sales_orders|receivables|payments)\b/i);

    const earning = functionBody(compensation, "create_verified_work_earning(");
    expect(earning).toContain("item.status <> 'VERIFIED'");
    expect(earning).toContain("WORK_VERIFICATION_REQUIRED");
  });
});
