import { describe, expect, it } from "vitest";

import { parseCompensationForm } from "@/modules/compensation/commands";

const ID = "20000000-0000-4000-8000-000000000001";
const ID_2 = "20000000-0000-4000-8000-000000000002";
function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("P12 compensation command validation", () => {
  it("parses an employee override plan with explicit effective dates", () => {
    expect(
      parseCompensationForm(
        form({
          kind: "compensation.plan.create",
          planCode: "cn-tx-01",
          name: "Mức trả riêng tài xế",
          versionNumber: "2",
          scopeType: "EMPLOYEE",
          employeeUserId: ID,
          effectiveFrom: "2026-09-01",
          effectiveTo: "2026-12-31",
          currency: "vnd",
          note: "Áp dụng theo quyết định đã được chủ doanh nghiệp duyệt",
        }),
      ),
    ).toMatchObject({
      planCode: "CN-TX-01",
      scopeType: "EMPLOYEE",
      employeeUserId: ID,
      currency: "VND",
    });
  });

  it("rejects an invalid plan scope shape", () => {
    expect(() =>
      parseCompensationForm(
        form({
          kind: "compensation.plan.create",
          planCode: "TX",
          name: "Mức trả tài xế",
          versionNumber: "1",
          scopeType: "ROLE",
          effectiveFrom: "2026-09-01",
          currency: "VND",
          note: "Áp dụng cho vai trò tài xế trong công ty",
        }),
      ),
    ).toThrow(/phải chọn đúng một vai trò/);
  });

  it("requires multi-worker allocation percentages to equal 100", () => {
    expect(() =>
      parseCompensationForm(
        form({
          kind: "earning.create_from_work",
          workItemId: ID,
          ruleType: "PER_TRIP",
          allocationMode: "PERCENT",
          workerUserId1: ID,
          sharePercent1: "60",
          workerUserId2: ID_2,
          sharePercent2: "30",
          note: "Chia theo biên bản xác nhận hai người cùng thực hiện",
        }),
      ),
    ).toThrow(/bằng 100%/);
  });

  it("keeps a signed adjustment explicit and requires a reason", () => {
    expect(
      parseCompensationForm(
        form({
          kind: "earning.adjust",
          earningAllocationId: ID,
          amount: "-150000",
          reason: "Điều chỉnh giảm theo biên bản đối soát cuối kỳ",
        }),
      ),
    ).toMatchObject({ amount: "-150000" });
  });

  it("parses a bonus as an entitlement proposal, not a payment", () => {
    expect(
      parseCompensationForm(
        form({
          kind: "earning.bonus",
          employeeUserId: ID,
          earnedOn: "2026-09-04",
          note: "Thưởng an toàn vận hành trong tháng",
        }),
      ),
    ).toMatchObject({ kind: "earning.bonus", earnedOn: "2026-09-04" });
  });
});
