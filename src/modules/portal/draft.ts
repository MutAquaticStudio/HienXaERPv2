import type { WorkerJob } from "@/modules/portal/types";

export type SafeWorkDraft = {
  actualQuantity: string;
  receiverName: string;
  note: string;
  operationId: string;
  expectedVersion: number;
  sourceRejected?: boolean;
  delivery?: {
    expectedVersion: number;
    expectedAssignmentVersion: number | null;
    missingArrivalReason: string;
    lines: { deliveryLineId: string; actualQuantity: string }[];
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSafeWorkDraft(expectedVersion: number, operationId: string): SafeWorkDraft {
  return { actualQuantity: "", receiverName: "", note: "", operationId, expectedVersion };
}

export function parseSafeWorkDraft(
  raw: string | null,
  expectedVersion: number,
  fallbackOperationId: string,
  delivery?: WorkerJob["delivery"],
): SafeWorkDraft {
  let parsed: SafeWorkDraft;
  let value: Record<string, unknown> = {};
  try {
    value = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed = {
      actualQuantity: typeof value.actualQuantity === "string" ? value.actualQuantity.slice(0, 40) : "",
      receiverName: typeof value.receiverName === "string" ? value.receiverName.slice(0, 120) : "",
      note: typeof value.note === "string" ? value.note.slice(0, 1000) : "",
      operationId: typeof value.operationId === "string" && UUID_PATTERN.test(value.operationId)
        ? value.operationId
        : fallbackOperationId,
      expectedVersion: Number.isInteger(value.expectedVersion) && Number(value.expectedVersion) > 0
        ? Number(value.expectedVersion)
        : expectedVersion,
      ...(value.sourceRejected === true ? { sourceRejected: true } : {}),
    };
  } catch {
    parsed = createSafeWorkDraft(expectedVersion, fallbackOperationId);
  }
  if (delivery) {
    const saved = value.delivery && typeof value.delivery === "object"
      ? value.delivery as Record<string, unknown> : {};
    const savedLines = Array.isArray(saved.lines) ? saved.lines : [];
    parsed.delivery = {
      expectedVersion: Number.isInteger(saved.expectedVersion) && Number(saved.expectedVersion) > 0
        ? Number(saved.expectedVersion) : delivery.version,
      expectedAssignmentVersion: Number.isInteger(saved.expectedAssignmentVersion) && Number(saved.expectedAssignmentVersion) > 0
        ? Number(saved.expectedAssignmentVersion) : delivery.assignment_version,
      missingArrivalReason: typeof saved.missingArrivalReason === "string" ? saved.missingArrivalReason.slice(0, 1000) : "",
      lines: delivery.lines.map((line) => {
        const savedLine = savedLines.find((item) => item && typeof item === "object"
          && (item as Record<string, unknown>).deliveryLineId === line.id) as Record<string, unknown> | undefined;
        return { deliveryLineId: line.id, actualQuantity: typeof savedLine?.actualQuantity === "string"
          ? savedLine.actualQuantity.slice(0, 40) : delivery.lines.length === 1 ? parsed.actualQuantity : "" };
      }),
    };
  }
  return parsed;
}

export function serializeSafeWorkDraft(draft: SafeWorkDraft) {
  return JSON.stringify({
    actualQuantity: draft.actualQuantity,
    receiverName: draft.receiverName,
    note: draft.note,
    operationId: draft.operationId,
    expectedVersion: draft.expectedVersion,
    ...(draft.sourceRejected ? { sourceRejected: true } : {}),
    ...(draft.delivery ? { delivery: {
      expectedVersion: draft.delivery.expectedVersion,
      expectedAssignmentVersion: draft.delivery.expectedAssignmentVersion,
      missingArrivalReason: draft.delivery.missingArrivalReason,
      lines: draft.delivery.lines.map(({ deliveryLineId, actualQuantity }) => ({ deliveryLineId, actualQuantity })),
    } } : {}),
  });
}
