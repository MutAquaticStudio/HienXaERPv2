import { PlatformError } from "@/modules/platform/errors";
import type {
  SourcingCommandKind,
  SourcingMode,
} from "@/modules/sourcing/types";

export type SourcingCommandInput =
  | {
      kind: "supplier.create";
      code: string;
      name: string;
      taxCode: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
    }
  | {
      kind: "supplier-price.record";
      supplierId: string;
      materialId: string;
      uomId: string;
      unitCost: string;
      currency: string;
      validFrom: string;
      changeReason: string;
    }
  | {
      kind: "supply.allocate";
      salesOrderLineId: string;
      fulfillmentRequirementId: string;
      sourcingMode: SourcingMode;
      quantity: string;
      supplierId: string | null;
      warehouseId: string | null;
      directCustomerId: string | null;
      directCustomerSiteId: string | null;
    }
  | { kind: "purchase-order.create"; supplyAllocationId: string }
  | { kind: "purchase-order.confirm"; purchaseOrderId: string }
  | { kind: "purchase-order.send"; purchaseOrderId: string }
  | { kind: "purchase-order.acknowledge"; purchaseOrderId: string }
  | {
      kind: "purchase-order.cancel";
      purchaseOrderId: string;
      reason: string;
    };

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_SOURCING_DATA", 400);
}

function textValue(
  formData: FormData,
  name: string,
  label: string,
  maximum = 180,
) {
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
  const value = optionalText(formData, name, 80);
  if (value === null) {
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

function positiveNumber(
  formData: FormData,
  name: string,
  label: string,
  scale: number,
) {
  const value = textValue(formData, name, label, 30);
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(value) || Number(value) <= 0) {
    invalid(`${label} phải lớn hơn 0, tối đa ${scale} chữ số thập phân.`);
  }
  return value;
}

export function parseSourcingForm(
  formData: FormData,
  today: string,
): SourcingCommandInput {
  const kind = textValue(
    formData,
    "kind",
    "Loại thao tác",
    40,
  ) as SourcingCommandKind;
  switch (kind) {
    case "supplier.create": {
      const code = textValue(
        formData,
        "code",
        "Mã nhà cung cấp",
        32,
      ).toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code))
        invalid("Mã nhà cung cấp không hợp lệ.");
      const email = optionalText(formData, "email", 180);
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        invalid("Email không hợp lệ.");
      return {
        kind,
        code,
        name: textValue(formData, "name", "Tên nhà cung cấp", 180),
        taxCode: optionalText(formData, "taxCode", 32),
        phone: optionalText(formData, "phone", 32),
        email,
        address: optionalText(formData, "address", 300),
      };
    }
    case "supplier-price.record": {
      const validFrom = dateValue(formData, "validFrom", "Ngày hiệu lực");
      if (validFrom < today)
        invalid("Ngày hiệu lực giá mua không được trước ngày hiện tại.");
      const changeReason = textValue(
        formData,
        "changeReason",
        "Lý do ghi nhận giá",
        500,
      );
      if (changeReason.length < 10)
        invalid("Lý do ghi nhận giá cần ít nhất 10 ký tự.");
      return {
        kind,
        supplierId: identifier(formData, "supplierId", "Nhà cung cấp")!,
        materialId: identifier(formData, "materialId", "Vật liệu")!,
        uomId: identifier(formData, "uomId", "Đơn vị tính")!,
        unitCost: positiveNumber(formData, "unitCost", "Đơn giá mua", 2),
        currency: textValue(formData, "currency", "Tiền tệ", 3).toUpperCase(),
        validFrom,
        changeReason,
      };
    }
    case "supply.allocate": {
      const sourcingMode = textValue(
        formData,
        "sourcingMode",
        "Cách lấy hàng",
        30,
      ) as SourcingMode;
      if (
        !["WAREHOUSE", "SUPPLIER_DIRECT", "SUPPLIER_TO_WAREHOUSE"].includes(
          sourcingMode,
        )
      ) {
        invalid("Cách lấy hàng không được hỗ trợ.");
      }
      return {
        kind,
        salesOrderLineId: identifier(
          formData,
          "salesOrderLineId",
          "Dòng đơn bán",
        )!,
        fulfillmentRequirementId: identifier(
          formData,
          "fulfillmentRequirementId",
          "Yêu cầu thực hiện",
        )!,
        sourcingMode,
        quantity: positiveNumber(
          formData,
          "quantity",
          "Số lượng phân nguồn",
          6,
        ),
        supplierId: identifier(formData, "supplierId", "Nhà cung cấp", true),
        warehouseId: identifier(formData, "warehouseId", "Kho", true),
        directCustomerId: identifier(
          formData,
          "directCustomerId",
          "Khách nhận",
          true,
        ),
        directCustomerSiteId: identifier(
          formData,
          "directCustomerSiteId",
          "Điểm giao",
          true,
        ),
      };
    }
    case "purchase-order.create":
      return {
        kind,
        supplyAllocationId: identifier(
          formData,
          "supplyAllocationId",
          "Phần chia nguồn",
        )!,
      };
    case "purchase-order.confirm":
    case "purchase-order.send":
    case "purchase-order.acknowledge":
      return {
        kind,
        purchaseOrderId: identifier(formData, "purchaseOrderId", "Đơn mua")!,
      };
    case "purchase-order.cancel": {
      const reason = textValue(formData, "reason", "Lý do hủy", 500);
      if (reason.length < 10) invalid("Lý do hủy cần ít nhất 10 ký tự.");
      return {
        kind,
        purchaseOrderId: identifier(formData, "purchaseOrderId", "Đơn mua")!,
        reason,
      };
    }
    default:
      return invalid("Thao tác nguồn hàng không được hỗ trợ.");
  }
}
