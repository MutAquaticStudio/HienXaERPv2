export type SafeWorkDraft = {
  actualQuantity: string;
  receiverName: string;
  note: string;
  operationId: string;
  expectedVersion: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSafeWorkDraft(expectedVersion: number, operationId: string): SafeWorkDraft {
  return { actualQuantity: "", receiverName: "", note: "", operationId, expectedVersion };
}

export function parseSafeWorkDraft(
  raw: string | null,
  expectedVersion: number,
  fallbackOperationId: string,
): SafeWorkDraft {
  if (!raw) return createSafeWorkDraft(expectedVersion, fallbackOperationId);
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return {
      actualQuantity: typeof value.actualQuantity === "string" ? value.actualQuantity.slice(0, 40) : "",
      receiverName: typeof value.receiverName === "string" ? value.receiverName.slice(0, 120) : "",
      note: typeof value.note === "string" ? value.note.slice(0, 1000) : "",
      operationId: typeof value.operationId === "string" && UUID_PATTERN.test(value.operationId)
        ? value.operationId
        : fallbackOperationId,
      expectedVersion: Number.isInteger(value.expectedVersion) && Number(value.expectedVersion) > 0
        ? Number(value.expectedVersion)
        : expectedVersion,
    };
  } catch {
    return createSafeWorkDraft(expectedVersion, fallbackOperationId);
  }
}

export function serializeSafeWorkDraft(draft: SafeWorkDraft) {
  return JSON.stringify({
    actualQuantity: draft.actualQuantity,
    receiverName: draft.receiverName,
    note: draft.note,
    operationId: draft.operationId,
    expectedVersion: draft.expectedVersion,
  });
}
