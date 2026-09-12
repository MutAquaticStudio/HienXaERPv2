import { createHash } from "node:crypto";
import { AppError } from "./errors";

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(payload))).digest("hex");
}

export function assertIdempotentReplay(existingHash: string, incomingPayload: unknown): void {
  if (existingHash !== payloadHash(incomingPayload)) {
    throw new AppError({ code: "CONFLICT", message: "Idempotency key đã được dùng với payload khác.", status: 409 });
  }
}
