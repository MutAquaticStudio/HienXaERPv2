import { describe, expect, it } from "vitest";
import { buildSplitPlan, remainderOf } from "./split";

const lines = [{ id: "cement", planned: "200" }, { id: "sand", planned: "300" }];
const none = [] as never[];

describe("D46 tách phiếu giao — chia số lượng", () => {
  it("phiếu 1 giữ phần còn lại, các phiếu sau lấy đúng số đã nhập", () => {
    const plan = buildSplitPlan(lines, 3, { cement: [undefined as never, "60", "40"] }, none);
    expect(plan).toEqual({ ok: true, parts: [
      { lines: [{ delivery_line_id: "cement", base_quantity: "100" }, { delivery_line_id: "sand", base_quantity: "300" }] },
      { lines: [{ delivery_line_id: "cement", base_quantity: "60" }] },
      { lines: [{ delivery_line_id: "cement", base_quantity: "40" }] },
    ] });
  });

  it("chia nguyên dòng: phiếu 1 không còn dòng đã chuyển hết", () => {
    const plan = buildSplitPlan(lines, 2, { sand: ["", "300"] }, none);
    expect(plan.ok && plan.parts.map((part) => part.lines.map((line) => line.delivery_line_id))).toEqual([["cement"], ["sand"]]);
  });

  it("nhận số thập phân dấu phẩy, không làm tròn", () => {
    expect(remainderOf({ id: "x", planned: "10" }, ["2,25", "0.000001"]).toFixed()).toBe("7.749999");
    const plan = buildSplitPlan([{ id: "x", planned: "10" }], 2, { x: ["", "2,25"] }, none);
    expect(plan.ok && plan.parts[1].lines[0].base_quantity).toBe("2.25");
  });

  it("từ chối khi vượt số lượng, phiếu trống, quá 6 chữ số lẻ hoặc số phiếu sai", () => {
    expect(buildSplitPlan(lines, 2, { cement: ["", "250"] }, none)).toMatchObject({ ok: false, message: expect.stringContaining("vượt") });
    expect(buildSplitPlan(lines, 3, { cement: ["", "50"] }, none)).toMatchObject({ ok: false, message: expect.stringContaining("Phiếu 3 chưa có hàng") });
    expect(buildSplitPlan(lines, 2, { cement: ["", "1.0000001"] }, none)).toMatchObject({ ok: false, message: expect.stringContaining("6 chữ số") });
    expect(buildSplitPlan(lines, 2, { cement: ["200"], sand: ["", "300"] }, none).ok).toBe(true);
    expect(buildSplitPlan(lines, 6, {}, none)).toMatchObject({ ok: false });
    expect(buildSplitPlan(lines, 1, {}, none)).toMatchObject({ ok: false });
  });

  it("phân người/xe/giờ cho từng phiếu; thiếu một trong ba thì báo", () => {
    const pick = { employeeId: "e1", vehicleId: "v1", scheduledStart: "2026-11-03T08:00" };
    const plan = buildSplitPlan(lines, 2, { sand: ["", "300"] }, [{ employeeId: "", vehicleId: "", scheduledStart: "" }, pick]);
    expect(plan.ok && plan.parts[1]).toMatchObject({ employee_id: "e1", vehicle_id: "v1", scheduled_start: "2026-11-03T08:00" });
    expect(plan.ok && plan.parts[0].employee_id).toBeUndefined();
    expect(buildSplitPlan(lines, 2, { sand: ["", "300"] }, [{ ...pick, vehicleId: "" }])).toMatchObject({ ok: false, message: expect.stringContaining("Phiếu 1") });
  });
});
