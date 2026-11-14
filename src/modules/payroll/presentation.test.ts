import { describe, expect, it } from "vitest";

import { componentMethodLabel, describeTiers, describeWorkRateItem, payrollCsv, payrollError, percentToBps, workRateCount } from "./presentation";

describe("payroll presentation", () => {
  it("reads a percent typed with a comma or a dot", () => {
    expect(percentToBps("1,5")).toBe(150);
    expect(percentToBps("2")).toBe(200);
    expect(percentToBps("100")).toBe(10000);
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
  });

  it("names the trip and job pay of D35", () => {
    expect(componentMethodLabel("PER_TRIP")).toBe("Mỗi chuyến giao đã xác minh");
    expect(componentMethodLabel("PER_JOB")).toBe("Mỗi việc dịch vụ đã xác minh");
  });

  it("explains a second price for one vehicle in Vietnamese (D70)", () => {
    expect(payrollError('duplicate key value violates unique constraint "payroll_components_trip_vehicle_unique"'))
      .toBe("Xe này đã có đơn giá chuyến. Sửa đơn giá đó thay vì thêm mới.");
    expect(payrollError("duplicate key value violates unique constraint \"payroll_components_branch_id_code_key\"")).toBe("Mã đã có. Chọn mã khác.");
  });

  it("describes each line of the pay by work rates, paid or still without a rate (D76)", () => {
    expect(componentMethodLabel("WORK_RATE")).toBe("Theo đơn giá công việc (hàng đã giao, dịch vụ)");
    expect(describeWorkRateItem({ kind: "GOODS", label: "Xi măng", uom: "bao", quantity: "4", rate_vnd: "2500", amount_vnd: "10000" })).toBe("Xi măng · 4 bao × 2.500 ₫ = 10.000 ₫");
    expect(describeWorkRateItem({ kind: "SERVICE", label: "Vận chuyển", uom: "lượt", quantity: "3", rate_bps: 2000, amount_vnd: "90000" }))
      .toBe("Vận chuyển · 3 lượt × 20% số tiền tính khách = 90.000 ₫");
    expect(describeWorkRateItem({ kind: "GOODS", label: "Thép buộc", uom: "kg", quantity: "40" })).toBe("Thép buộc · 40 kg");
    expect(workRateCount([{}, {}])).toBe(" (2 loại hàng / dịch vụ)");
    expect(workRateCount([])).toBe("");
  });

  it("explains a refused work rate and a second pay-by-work component in Vietnamese (D76)", () => {
    expect(payrollError("invalid_work_rate")).toContain("Đơn giá chưa hợp lệ");
    expect(payrollError('duplicate key value violates unique constraint "payroll_components_work_rate_unique"')).toContain("Đã có một khoản “Theo đơn giá công việc”");
  });

  it("describes sales tiers in order", () => {
    expect(describeTiers([{ from_vnd: "100000000", rate_bps: 150 }, { from_vnd: "0", rate_bps: 50 }]))
      .toBe("từ 0 đ: 0,5% · từ 100.000.000 đ: 1,5%");
  });

  it("builds a CSV Excel opens with Vietnamese text", () => {
    const csv = payrollCsv([{ name: 'Thợ "A"', net: "3315000" }], [["name", "Nhân viên"], ["net", "Thực lĩnh"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"Nhân viên","Thực lĩnh"\r\n"Thợ ""A""","3315000"');
  });

  it("explains a refused close in Vietnamese", () => {
    expect(payrollError("payroll_attendance_not_closed")).toContain("Chốt chấm công trước");
    expect(payrollError("weird")).toBe("Chưa lưu được. Kiểm tra kết nối rồi thử lại.");
  });
});
