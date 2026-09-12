import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { assertIdempotentReplay, payloadHash } from "./idempotency";

describe("idempotency payload binding", () => {
  it("is stable across object key order", () => {
    expect(payloadHash({ amount: 6_000_000, order: "SO-1" })).toBe(payloadHash({ order: "SO-1", amount: 6_000_000 }));
  });

  it("rejects key reuse with a different payload", () => {
    const existing = payloadHash({ order: "SO-1" });
    expect(() => assertIdempotentReplay(existing, { order: "SO-2" })).toThrowError(AppError);
  });
});
