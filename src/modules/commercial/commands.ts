import type { CommercialCommandKind } from "@/modules/commercial/types";
import { PlatformError } from "@/modules/platform/errors";

export type CommercialCommandInput =
  | {
      kind: "quotation.create";
      customerId: string;
      customerSiteId: string | null;
      validUntil: string;
      notes: string | null;
    }
  | {
      kind: "quotation.add-line";
      revisionId: string;
      materialId: string;
      quantity: string;
      uomId: string;
      requestedUnitPrice: string | null;
      priceOverrideReason: string | null;
    }
  | { kind: "quotation.refresh-prices"; revisionId: string }
  | { kind: "quotation.send"; revisionId: string }
  | { kind: "quotation.accept"; revisionId: string }
  | { kind: "quotation.revise"; revisionId: string; validUntil: string }
  | { kind: "sales-order.convert"; revisionId: string }
  | {
      kind: "sales-order.confirm";
      salesOrderId: string;
      creditOverrideReason: string | null;
    };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_COMMERCIAL_DATA", 400);
}

function textValue(
  formData: FormData,
  name: string,
  label: string,
  maximum = 180,
): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim())
    invalid(`${label} là bắt buộc.`);
  const normalized = (value as string).trim();
  if (normalized.length > maximum)
    invalid(`${label} không được vượt quá ${maximum} ký tự.`);
  return normalized;
}

function optionalText(formData: FormData, name: string, maximum = 500) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.length > maximum)
    invalid(`Nội dung không được vượt quá ${maximum} ký tự.`);
  return normalized;
}

function identifier(
  formData: FormData,
  name: string,
  label: string,
  optional = false,
) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    if (optional) return null;
    return invalid(`${label} là bắt buộc.`);
  }
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(value)) invalid(`${label} không hợp lệ.`);
  return value;
}

function dateValue(formData: FormData, name: string, label: string) {
  const value = textValue(formData, name, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    invalid(`${label} không hợp lệ.`);
  }
  return value;
}

function quantityValue(formData: FormData, name: string, label: string) {
  const value = textValue(formData, name, label, 30);
  if (!/^\d+(?:\.\d{1,6})?$/.test(value) || Number(value) <= 0) {
    invalid(`${label} phải lớn hơn 0, tối đa 6 chữ số thập phân.`);
  }
  return value;
}

function optionalMoney(formData: FormData, name: string) {
  const value = optionalText(formData, name, 24);
  if (value === null) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) {
    invalid("Đơn giá đề nghị phải lớn hơn 0, tối đa 2 chữ số thập phân.");
  }
  return value;
}

export function parseCommercialForm(
  formData: FormData,
  today: string,
): CommercialCommandInput {
  const kind = textValue(
    formData,
    "kind",
    "Loại thao tác",
    40,
  ) as CommercialCommandKind;
  switch (kind) {
    case "quotation.create": {
      const validUntil = dateValue(formData, "validUntil", "Ngày hết hiệu lực");
      if (validUntil < today)
        invalid("Ngày hết hiệu lực không được trước ngày hiện tại.");
      return {
        kind,
        customerId: identifier(formData, "customerId", "Khách hàng")!,
        customerSiteId: identifier(
          formData,
          "customerSiteId",
          "Địa điểm",
          true,
        ),
        validUntil,
        notes: optionalText(formData, "notes"),
      };
    }
    case "quotation.add-line":
      return {
        kind,
        revisionId: identifier(formData, "revisionId", "Phiên bản báo giá")!,
        materialId: identifier(formData, "materialId", "Vật liệu")!,
        quantity: quantityValue(formData, "quantity", "Số lượng"),
        uomId: identifier(formData, "uomId", "Đơn vị tính")!,
        requestedUnitPrice: optionalMoney(formData, "requestedUnitPrice"),
        priceOverrideReason: optionalText(formData, "priceOverrideReason"),
      };
    case "quotation.refresh-prices":
    case "quotation.send":
    case "quotation.accept":
    case "sales-order.convert":
      return {
        kind,
        revisionId: identifier(formData, "revisionId", "Phiên bản báo giá")!,
      };
    case "quotation.revise": {
      const validUntil = dateValue(formData, "validUntil", "Ngày hết hiệu lực");
      if (validUntil < today)
        invalid("Ngày hết hiệu lực không được trước ngày hiện tại.");
      return {
        kind,
        revisionId: identifier(formData, "revisionId", "Phiên bản báo giá")!,
        validUntil,
      };
    }
    case "sales-order.confirm":
      return {
        kind,
        salesOrderId: identifier(formData, "salesOrderId", "Đơn bán")!,
        creditOverrideReason: optionalText(formData, "creditOverrideReason"),
      };
    default:
      return invalid("Thao tác báo giá hoặc đơn bán không được hỗ trợ.");
  }
}
