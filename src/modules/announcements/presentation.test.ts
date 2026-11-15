import { expect, it } from "vitest";
import { chipOf, lineChange, linkLabel, parseAnnouncements, reachSentence, unitText, valueText } from "./presentation";

const line = (old: string | null, next: string | null, kind: "VND" | "BPS" = "VND") =>
  ({ name: "Xi măng", unit: "Bao", old, old_kind: old === null ? null : kind, new: next, new_kind: next === null ? null : kind });

it("says how a line changed in words, exact to the đồng", () => {
  expect(lineChange(line("95000", "98000"))).toEqual({ tone: "up", text: "Tăng 3.000 ₫" });
  expect(lineChange(line("120000", "116000"))).toEqual({ tone: "down", text: "Giảm 4.000 ₫" });
  expect(lineChange(line("9223372036854775000", "9223372036854775807"))).toEqual({ tone: "up", text: "Tăng 807 ₫" });
  expect(lineChange(line(null, "3500"))).toEqual({ tone: "new", text: "Mới" });
  expect(lineChange(line("3000", null))).toEqual({ tone: "stopped", text: "Ngừng áp dụng" });
  expect(lineChange(line("500", "450", "BPS"))).toEqual({ tone: "down", text: "Giảm 0,5%" });
  expect(lineChange({ ...line("50000", "500"), new_kind: "BPS" })).toEqual({ tone: "changed", text: "Đổi cách tính" });
});

it("formats prices and shares, units for prices and pay rates", () => {
  expect(valueText("1650", "VND")).toBe("1.650 ₫");
  expect(valueText("250", "BPS")).toBe("2,5%");
  expect(valueText(null, "VND")).toBe("—");
  expect(unitText({ kind: "PRICE" }, line("1", "2"))).toBe("Bao");
  expect(unitText({ kind: "PAY_RATE" }, line("1", "2"))).toBe("mỗi Bao");
  expect(unitText({ kind: "PAY_RATE" }, line("1", "2", "BPS"))).toBe("trên tiền tính khách");
});

it("labels and in-app links", () => {
  expect(chipOf({ kind: "PRICE", label: null }).text).toBe("CẬP NHẬT GIÁ");
  expect(chipOf({ kind: "MANUAL", label: "RULE" }).text).toBe("QUY ĐỊNH MỚI");
  expect(linkLabel("CUSTOMER", "/customer/services/new")).toBe("Đặt dịch vụ");
  expect(linkLabel("CUSTOMER", "/admin/orders")).toBeNull();
  expect(linkLabel("WORKER", "https://example.com")).toBeNull();
  expect(reachSentence(38)).toBe(" Đã báo 38 khách có giá thay đổi.");
  expect(reachSentence(0)).toBe("");
  expect(reachSentence(null)).toBe("");
});

it("only accepts announcements of the expected shape (money as whole đồng text)", () => {
  const good = { id: "10000000-0000-4000-8000-000000000001", audience: "CUSTOMER", kind: "PRICE", title: "Giá mới", created_at: "2026-11-15T00:00:00Z",
    lines: [{ name: "Xi măng", old: "95000", old_kind: "VND", new: "98000", new_kind: "VND" }] };
  expect(parseAnnouncements([good])).toHaveLength(1);
  expect(parseAnnouncements([{ ...good, lines: [{ name: "Xi măng", old: 95000.5 }] }])).toEqual([]);
  expect(parseAnnouncements({ error: "x" })).toEqual([]);
});
