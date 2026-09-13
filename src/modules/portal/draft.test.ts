import { describe, expect, it } from "vitest";

import { parseSafeWorkDraft, serializeSafeWorkDraft } from "@/modules/portal/draft";

describe("worker local draft", () => {
  it("keeps only retry-safe non-sensitive fields", () => {
    const operationId = "11111111-1111-4111-8111-111111111111";
    const parsed = parseSafeWorkDraft(JSON.stringify({
      actualQuantity: "12.5",
      receiverName: "Nguyen Van A",
      note: "Da giao du hang",
      operationId,
      expectedVersion: 7,
      accessToken: "must-not-survive",
      imageData: "data:image/png;base64,secret",
      evidenceId: "private-object",
      amountVnd: 999,
    }), 2, "22222222-2222-4222-8222-222222222222");

    expect(JSON.parse(serializeSafeWorkDraft(parsed))).toEqual({
      actualQuantity: "12.5",
      receiverName: "Nguyen Van A",
      note: "Da giao du hang",
      operationId,
      expectedVersion: 7,
    });
  });

  it("falls back from malformed persisted state", () => {
    const fallback = "22222222-2222-4222-8222-222222222222";
    expect(parseSafeWorkDraft("not-json", 3, fallback)).toEqual({
      actualQuantity: "",
      receiverName: "",
      note: "",
      operationId: fallback,
      expectedVersion: 3,
    });
  });
});
