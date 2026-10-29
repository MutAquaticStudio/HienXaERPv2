import { describe, expect, it } from "vitest";

import { describeTiers, payrollCsv, payrollError, percentToBps } from "./presentation";

describe("payroll presentation", () => {
  it("reads a percent typed with a comma or a dot", () => {
    expect(percentToBps("1,5")).toBe(150);
    expect(percentToBps("2")).toBe(200);
    expect(percentToBps("100")).toBe(10000);
    expect(percentToBps("101")).toBeNull();
    expect(percentToBps("abc")).toBeNull();
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
