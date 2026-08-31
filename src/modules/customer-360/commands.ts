import {
  CUSTOMER_TIERS,
  PRICE_RULE_SCOPES,
  type Customer360EntityKind,
  type CustomerTier,
  type PriceRuleScope,
} from "@/modules/customer-360/types";
import { PlatformError } from "@/modules/platform/errors";

interface BaseCommand {
  kind: Customer360EntityKind;
}

export type SaveCustomer360Input =
  | (BaseCommand & {
      kind: "customer";
      code: string;
      name: string;
      legalName: string | null;
      taxCode: string | null;
      phone: string | null;
      email: string | null;
      tier: CustomerTier;
    })
  | (BaseCommand & {
      kind: "contact";
      customerId: string;
      name: string;
      role: string | null;
      phone: string | null;
      email: string | null;
      isPrimary: boolean;
    })
  | (BaseCommand & {
      kind: "site";
      customerId: string;
      code: string;
      name: string;
      address: string;
      deliveryNotes: string | null;
      isDefault: boolean;
    })
  | (BaseCommand & {
      kind: "price-rule";
      scope: PriceRuleScope;
      customerId: string | null;
      customerTier: CustomerTier | null;
      materialId: string | null;
      materialGroupId: string | null;
      unitPrice: string;
      currency: string;
      uomId: string;
      validFrom: string;
      changeReason: string;
    })
  | (BaseCommand & {
      kind: "credit-policy";
      customerId: string;
      creditLimit: string;
      allowedOverdueDays: number;
      validFrom: string;
      changeReason: string;
    })
  | (BaseCommand & {
      kind: "credit-override";
      customerId: string;
      orderAmount: string;
      reason: string;
    });

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_CUSTOMER_DATA", 400);
}

function textValue(
  formData: FormData,
  name: string,
  label: string,
  maximum = 180,
): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    return invalid(`${label} là bắt buộc.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    return invalid(`${label} không được vượt quá ${maximum} ký tự.`);
  }
  return normalized;
}

function optionalText(
  formData: FormData,
  name: string,
  maximum = 500,
): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.length > maximum) {
    return invalid(`Nội dung không được vượt quá ${maximum} ký tự.`);
  }
  return normalized;
}

function codeValue(formData: FormData, name = "code"): string {
  const value = textValue(formData, name, "Mã", 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(value)) {
    return invalid("Mã chỉ gồm chữ in hoa, số, gạch ngang hoặc gạch dưới.");
  }
  return value;
}

function identifier(
  formData: FormData,
  name: string,
  label: string,
  optional = false,
): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    if (optional) return null;
    return invalid(`${label} là bắt buộc.`);
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
    return invalid(`${label} không hợp lệ.`);
  }
  return value;
}

function moneyValue(
  formData: FormData,
  name: string,
  label: string,
  allowZero = false,
): string {
  const value = textValue(formData, name, label, 24);
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return invalid(`${label} phải là số, tối đa 2 chữ số thập phân.`);
  }
  if (allowZero ? Number(value) < 0 : Number(value) <= 0) {
    return invalid(`${label} phải ${allowZero ? "từ 0 trở lên" : "lớn hơn 0"}.`);
  }
  return value;
}

function dateValue(formData: FormData, name: string, label: string): string {
  const value = textValue(formData, name, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    return invalid(`${label} không hợp lệ.`);
  }
  return value;
}

function booleanValue(formData: FormData, name: string): boolean {
  return formData.get(name) === "on" || formData.get(name) === "true";
}

function tierValue(
  formData: FormData,
  name: string,
  optional = false,
): CustomerTier | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) {
    if (optional) return null;
    return invalid("Hạng khách hàng là bắt buộc.");
  }
  if (!CUSTOMER_TIERS.includes(value as CustomerTier)) {
    return invalid("Hạng khách hàng không hợp lệ.");
  }
  return value as CustomerTier;
}

export function parseSaveCustomer360Form(
  formData: FormData,
): SaveCustomer360Input {
  const kind = textValue(
    formData,
    "kind",
    "Loại dữ liệu",
    40,
  ) as Customer360EntityKind;

  switch (kind) {
    case "customer":
      return {
        kind,
        code: codeValue(formData),
        name: textValue(formData, "name", "Tên khách hàng"),
        legalName: optionalText(formData, "legalName", 240),
        taxCode: optionalText(formData, "taxCode", 32),
        phone: optionalText(formData, "phone", 30),
        email: optionalText(formData, "email", 180),
        tier: tierValue(formData, "tier")!,
      };
    case "contact": {
      const phone = optionalText(formData, "phone", 30);
      const email = optionalText(formData, "email", 180);
      if (!phone && !email) {
        return invalid("Người liên hệ cần có số điện thoại hoặc email.");
      }
      return {
        kind,
        customerId: identifier(formData, "customerId", "Khách hàng")!,
        name: textValue(formData, "name", "Tên người liên hệ"),
        role: optionalText(formData, "role", 100),
        phone,
        email,
        isPrimary: booleanValue(formData, "isPrimary"),
      };
    }
    case "site":
      return {
        kind,
        customerId: identifier(formData, "customerId", "Khách hàng")!,
        code: codeValue(formData),
        name: textValue(formData, "name", "Tên địa điểm"),
        address: textValue(formData, "address", "Địa chỉ", 500),
        deliveryNotes: optionalText(formData, "deliveryNotes", 500),
        isDefault: booleanValue(formData, "isDefault"),
      };
    case "price-rule": {
      const scope = textValue(
        formData,
        "scope",
        "Phạm vi giá",
        40,
      ) as PriceRuleScope;
      if (!PRICE_RULE_SCOPES.includes(scope)) {
        return invalid("Phạm vi giá không hợp lệ.");
      }
      const customerId = identifier(
        formData,
        "customerId",
        "Khách hàng",
        true,
      );
      const customerTier = tierValue(formData, "customerTier", true);
      const materialId = identifier(
        formData,
        "materialId",
        "Vật liệu",
        true,
      );
      const materialGroupId = identifier(
        formData,
        "materialGroupId",
        "Nhóm vật liệu",
        true,
      );
      const correctShape =
        (scope === "CUSTOMER_MATERIAL" &&
          customerId &&
          materialId &&
          !customerTier &&
          !materialGroupId) ||
        (scope === "CUSTOMER_MATERIAL_GROUP" &&
          customerId &&
          materialGroupId &&
          !customerTier &&
          !materialId) ||
        (scope === "CUSTOMER_TIER" &&
          customerTier &&
          materialId &&
          !customerId &&
          !materialGroupId) ||
        (scope === "DEFAULT" &&
          materialId &&
          !customerId &&
          !customerTier &&
          !materialGroupId);
      if (!correctShape) {
        return invalid("Đối tượng áp dụng không đúng với tầng ưu tiên đã chọn.");
      }
      return {
        kind,
        scope,
        customerId,
        customerTier,
        materialId,
        materialGroupId,
        unitPrice: moneyValue(formData, "unitPrice", "Đơn giá"),
        currency: textValue(formData, "currency", "Tiền tệ", 3).toUpperCase(),
        uomId: identifier(formData, "uomId", "Đơn vị giá")!,
        validFrom: dateValue(formData, "validFrom", "Ngày hiệu lực"),
        changeReason: textValue(
          formData,
          "changeReason",
          "Lý do thay đổi giá",
          500,
        ),
      };
    }
    case "credit-policy": {
      const days = Number(
        textValue(formData, "allowedOverdueDays", "Số ngày quá hạn", 3),
      );
      if (!Number.isInteger(days) || days < 0 || days > 365) {
        return invalid("Số ngày quá hạn phải từ 0 đến 365.");
      }
      return {
        kind,
        customerId: identifier(formData, "customerId", "Khách hàng")!,
        creditLimit: moneyValue(
          formData,
          "creditLimit",
          "Hạn mức",
          true,
        ),
        allowedOverdueDays: days,
        validFrom: dateValue(formData, "validFrom", "Ngày hiệu lực"),
        changeReason: textValue(
          formData,
          "changeReason",
          "Lý do thay đổi chính sách",
          500,
        ),
      };
    }
    case "credit-override":
      return {
        kind,
        customerId: identifier(formData, "customerId", "Khách hàng")!,
        orderAmount: moneyValue(formData, "orderAmount", "Giá trị dự kiến"),
        reason: textValue(
          formData,
          "reason",
          "Lý do vượt chặn tín dụng",
          500,
        ),
      };
    default:
      return invalid("Loại dữ liệu khách hàng không được hỗ trợ.");
  }
}
