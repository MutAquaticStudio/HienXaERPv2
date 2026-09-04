import { PlatformError } from "@/modules/platform/errors";
import type {
  WorkCommandKind,
  WorkSupervisorAction,
} from "@/modules/workforce/types";

export type WorkCommandInput =
  | { kind: "work.claim"; workItemId: string }
  | { kind: "work.start"; workItemId: string }
  | { kind: "work.heartbeat"; workItemId: string; progressNote: string | null }
  | { kind: "work.block"; workItemId: string; reason: string }
  | { kind: "work.complete"; workItemId: string }
  | { kind: "work.verify"; workItemId: string; reason: string }
  | {
      kind: "work.supervise";
      workItemId: string;
      action: WorkSupervisorAction;
      reassignUserId: string | null;
      reason: string;
    }
  | { kind: "work.sweep" };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_WORK_DATA", 400);
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}

function required(formData: FormData, name: string, label: string, maximum = 500) {
  const item = value(formData, name);
  if (!item) invalid(`${label} là bắt buộc.`);
  if (item.length > maximum) invalid(`${label} quá dài.`);
  return item;
}

function id(formData: FormData, name: string, label: string) {
  const item = required(formData, name, label, 80);
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(item)) invalid(`${label} không hợp lệ.`);
  return item;
}

function reason(formData: FormData, label = "Lý do") {
  const item = required(formData, "reason", label, 500);
  if (item.length < 10) invalid(`${label} cần ít nhất 10 ký tự.`);
  return item;
}

export function parseWorkForm(formData: FormData): WorkCommandInput {
  const kind = required(formData, "kind", "Loại thao tác", 40) as WorkCommandKind;
  if (kind === "work.sweep") return { kind };
  const workItemId = id(formData, "workItemId", "Công việc");
  switch (kind) {
    case "work.claim":
    case "work.start":
    case "work.complete":
      return { kind, workItemId };
    case "work.heartbeat": {
      const progressNote = value(formData, "progressNote");
      if (progressNote && progressNote.length < 2) invalid("Ghi chú tiến độ cần ít nhất 2 ký tự.");
      if (progressNote.length > 500) invalid("Ghi chú tiến độ quá dài.");
      return { kind, workItemId, progressNote: progressNote || null };
    }
    case "work.block":
      return { kind, workItemId, reason: reason(formData, "Lý do bị vướng") };
    case "work.verify":
      return { kind, workItemId, reason: reason(formData, "Ghi chú xác minh") };
    case "work.supervise": {
      const action = required(formData, "supervisorAction", "Quyết định", 30) as WorkSupervisorAction;
      if (!["KEEP_ASSIGNMENT", "RECALL", "REASSIGN", "CANCEL"].includes(action)) {
        invalid("Quyết định giám sát không được hỗ trợ.");
      }
      const reassignUserId = value(formData, "reassignUserId") || null;
      if (action === "REASSIGN" && !reassignUserId) invalid("Cần chọn người nhận việc mới.");
      return {
        kind,
        workItemId,
        action,
        reassignUserId,
        reason: reason(formData),
      };
    }
    default:
      return invalid("Thao tác công việc không được hỗ trợ.");
  }
}
