import { expect, it } from "vitest";
import { workCommandHttpStatus } from "./work-command-status";
it("distinguishes denied authority from a conflicting source", () => {
  expect(workCommandHttpStatus({ code: "42501", message: "forbidden" })).toBe(403);
  expect(workCommandHttpStatus({ code: "PT409", message: "stale_version" })).toBe(409);
  expect(workCommandHttpStatus(new Error("invalid input"))).toBe(409);
});
