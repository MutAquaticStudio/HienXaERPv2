import { expect, it } from "vitest";
import { AUTOMATION_EVENTS, BUILTIN_PUSHES, catalogueRows, filterRows, minuteToTime, ruleReach, timeToMinute, type AutomationRule, type Person } from "./automation-presentation";

const people: Person[] = [
  { id: "a", name: "An", role_id: "r1", role_name: "Bán hàng", devices: 2, permissions: ["orders.confirm"] },
  { id: "b", name: "Bình", role_id: "r1", role_name: "Bán hàng", devices: 0, permissions: ["orders.confirm"] },
  { id: "c", name: "Cường", role_id: "r2", role_name: "Kho", devices: 1, permissions: ["inventory.read"] },
];
const rule = (patch: Partial<AutomationRule>): AutomationRule => ({ id: "x", name: "Quy tắc", event: "order.portal_submitted", min_amount_vnd: null, problems_only: false,
  channels: ["PUSH"], target: null, active: true, version: 1, updated_at: "2026-11-16T00:00:00Z", recipient_mode: "PERMISSION", role_ids: [], employee_ids: [], ...patch });

it("counts only people who may see the notification, and their devices", () => {
  expect(ruleReach(people, "orders.confirm", "PERMISSION", [], [])).toMatchObject({ chosen: 2, allowed: 2, enabled: 1, devices: 2 });
  const byRole = ruleReach(people, "orders.confirm", "ROLES", ["r1", "r2"], []);
  expect(byRole).toMatchObject({ chosen: 3, allowed: 2, devices: 2 });
  expect(byRole.blocked.map((person) => person.name)).toEqual(["Cường"]);
  expect(ruleReach(people, "orders.confirm", "PEOPLE", [], ["b", "c"]).off.map((person) => person.name)).toEqual(["Bình"]);
});

it("lists every kind once: a rule replaces its app-only row, built-ins stay, a PUSH rule takes over its built-in", () => {
  const rows = catalogueRows({ rules: [rule({ id: "r", event: "work.assigned" })], builtins: { "customer.debt_reminder": false } });
  expect(rows.filter((row) => row.type === "app")).toHaveLength(AUTOMATION_EVENTS.length - 1);
  expect(rows.filter((row) => row.type === "builtin")).toHaveLength(BUILTIN_PUSHES.length);
  const builtin = rows.find((row) => row.key === "builtin:work.assigned");
  expect(builtin?.type === "builtin" && builtin.overridden?.id).toBe("r");
  expect(filterRows(rows, "phone").some((row) => row.key === "builtin:customer.debt_reminder")).toBe(false);
  expect(filterRows(rows, "mine").map((row) => row.key)).toEqual(["rule:r"]);
  const groups = rows.map((row) => row.group);
  expect(groups.indexOf("customer")).toBeGreaterThan(groups.lastIndexOf("worker"));
});

it("lists the D98 morning summary for customers with its label and hint", () => {
  const item = BUILTIN_PUSHES.find((push) => push.value === "customer.daily_summary");
  expect(item).toMatchObject({ group: "customer", audience: "customer", label: "Tóm tắt hàng đã đặt hôm trước (cho khách)", detail: "08:46 mỗi sáng, cho khách có đơn hôm trước" });
});

it("reads and writes quiet-hour times", () => {
  expect(minuteToTime(390)).toBe("06:30");
  expect(timeToMinute("21:00")).toBe(1260);
  expect(timeToMinute("25:00")).toBeNull();
});
