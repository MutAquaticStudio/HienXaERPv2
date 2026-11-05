// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AGENT_ACTIONS } from "./registry";
import { buildFormSpec, FORM_HINTS } from "./form-spec";

const actionOf = (kind: string) => AGENT_ACTIONS.find((action) => action.kind === kind)!;

describe("D65 form of a prepared card", () => {
  it("draws a Vietnamese form for a sales order: text, date, tick box and goods lines", () => {
    const input = { khach_hang: "Anh Tư", ngay_giao: "2026-11-06", dong_hang: [{ hang: "Xi măng", don_vi: "bao", so_luong: "50" }], xac_nhan: true };
    const spec = buildFormSpec("soan_don_ban", actionOf("soan_don_ban").properties, input)!;
    const by = Object.fromEntries(spec.fields.map((field) => [field.key, field]));
    expect(by.khach_hang).toMatchObject({ label: "Khách hàng", kind: "text" });
    expect(by.ngay_giao.kind).toBe("date");
    expect(by.xac_nhan.kind).toBe("checkbox");
    expect(by.dong_hang).toMatchObject({ kind: "lines", addLabel: "Thêm dòng hàng" });
    expect(by.dong_hang.columns?.map((column) => column.label)).toEqual(["Hàng", "Đơn vị", "Số lượng"]);
    expect(spec.values).toBe(input);
  });

  it("draws a list of choices for enumerated inputs and money boxes for amounts", () => {
    const spec = buildFormSpec("soan_thu_tien", actionOf("soan_thu_tien").properties, {})!;
    const method = spec.fields.find((field) => field.key === "phuong_thuc")!;
    expect(method.kind).toBe("select");
    expect(method.options?.map((option) => option.label)).toContain("Chuyển khoản");
    expect(spec.fields.find((field) => field.key === "so_tien")?.kind).toBe("money");
  });

  it("gives no form to an action without hints or with a single box, and every hinted action has a label per input", () => {
    expect(buildFormSpec("soan_tao_nhieu_vat_tu", {}, {})).toBeNull();
    for (const [kind, hints] of Object.entries(FORM_HINTS)) {
      const action = actionOf(kind);
      expect(action, kind).toBeDefined();
      for (const key of Object.keys(action.properties)) expect(hints.labels[key], `${kind}.${key}`).toBeTruthy();
    }
  });
});
