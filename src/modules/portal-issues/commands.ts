import { PlatformError } from "@/modules/platform/errors";
import {
  PORTAL_ISSUE_CATEGORIES,
  PORTAL_ISSUE_SOURCE_TYPES,
  type PortalIssueCategory,
  type PortalIssueCommandInput,
  type PortalIssueSourceType,
} from "@/modules/portal-issues/types";

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_PORTAL_ISSUE_DATA", 400);
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item.trim() : "";
}

function uuid(formData: FormData, name: string, label: string) {
  const item = value(formData, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item)) {
    invalid(`${label} không hợp lệ.`);
  }
  return item;
}

export function parsePortalIssueForm(formData: FormData): PortalIssueCommandInput {
  const sourceType = value(formData, "sourceType") as PortalIssueSourceType;
  if (!PORTAL_ISSUE_SOURCE_TYPES.includes(sourceType)) {
    invalid("Nguồn sự cố không hợp lệ.");
  }
  const category = value(formData, "category") as PortalIssueCategory;
  if (!PORTAL_ISSUE_CATEGORIES.includes(category)) {
    invalid("Loại sự cố không hợp lệ.");
  }
  const description = value(formData, "description");
  if (description.length < 10) invalid("Mô tả sự cố cần ít nhất 10 ký tự.");
  if (description.length > 500) invalid("Mô tả sự cố quá dài.");

  return {
    kind: "portal.issue.report",
    sourceType,
    sourceId: uuid(formData, "sourceId", "Công việc liên quan"),
    category,
    description,
  };
}
