import { describe, expect, it } from "vitest";

import { parseServiceJobForm } from "@/modules/service-jobs/commands";

const JOB_ID = "20000000-0000-4000-8000-000000000021";
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("P11 service job command validation", () => {
  it("keeps actual and approved billable hours separate", () => {
    expect(
      parseServiceJobForm(
        form({
          kind: "service.job.approve",
          serviceJobId: JOB_ID,
          rateType: "SHIFT",
          approvedBillableHours: "7.75",
          approvedBillableQuantity: "1",
          note: "Duyệt một ca theo biên bản nghiệm thu",
        }),
      ),
    ).toMatchObject({
      approvedBillableHours: "7.75",
      approvedBillableQuantity: "1",
    });
  });

  it("rejects hourly quantity that differs from approved hours", () => {
    expect(() =>
      parseServiceJobForm(
        form({
          kind: "service.job.approve",
          serviceJobId: JOB_ID,
          rateType: "HOUR",
          approvedBillableHours: "7.75",
          approvedBillableQuantity: "8",
          note: "Duyệt theo biên bản nghiệm thu đã ký",
        }),
      ),
    ).toThrow(/bằng số giờ/);
  });

  it("requires a meaningful incident and validates fuel payload", () => {
    expect(() =>
      parseServiceJobForm(
        form({
          kind: "service.job.log",
          serviceJobId: JOB_ID,
          logType: "INCIDENT",
          note: "Hỏng",
        }),
      ),
    ).toThrow(/10 ký tự/);
    expect(
      parseServiceJobForm(
        form({
          kind: "service.job.log",
          serviceJobId: JOB_ID,
          logType: "FUEL",
          fuelLiters: "50.5",
          fuelUnitCost: "25000",
          note: "Đổ giữa ca",
        }),
      ),
    ).toMatchObject({ fuelLiters: "50.5", fuelUnitCost: "25000" });
  });

  it("rejects a schedule with an end before its start", () => {
    expect(() =>
      parseServiceJobForm(
        form({
          kind: "service.job.create",
          customerId: JOB_ID,
          customerSiteId: JOB_ID,
          serviceTypeId: JOB_ID,
          machineId: JOB_ID,
          scheduledStartAt: "2026-09-04T10:00",
          scheduledEndAt: "2026-09-04T09:00",
          rateType: "HOUR",
          unitRate: "850000",
          currency: "VND",
        }),
      ),
    ).toThrow(/sau giờ bắt đầu/);
  });
});
