import { PlatformError } from "@/modules/platform/errors";
import {
  CUSTOMER_DELIVERY_ISSUE_CATEGORIES,
  CUSTOMER_QUOTE_REQUEST_TYPES,
  type CustomerDeliveryIssueCategory,
  type CustomerPortalCommand,
  type CustomerQuoteRequestType,
} from "@/modules/customer-portal/types";

function value(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_CUSTOMER_PORTAL_DATA", 400);
}

function uuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    invalid(`${label} không hợp lệ.`);
  }
  return value;
}

export function parseCustomerPortalForm(formData: FormData): CustomerPortalCommand {
  const kind = value(formData, "kind");
  if (kind === "customer.quote.accept") {
    return { kind, revisionId: uuid(value(formData, "revisionId"), "Phiên bản báo giá") };
  }
  if (kind === "customer.quote.request") {
    const requestType = value(formData, "requestType") as CustomerQuoteRequestType;
    if (!CUSTOMER_QUOTE_REQUEST_TYPES.includes(requestType)) invalid("Loại yêu cầu báo giá không hợp lệ.");
    const quantity = value(formData, "quantity");
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) invalid("Số lượng phải lớn hơn 0.");
    const note = value(formData, "note");
    if (note.length > 500) invalid("Ghi chú yêu cầu báo giá quá dài.");
    const sourceSalesOrderId = value(formData, "sourceSalesOrderId");
    const sourceQuotationRevisionId = value(formData, "sourceQuotationRevisionId");
    if (requestType === "REORDER" && !sourceSalesOrderId) invalid("Đơn hàng nguồn là bắt buộc khi đặt lại.");
    if (requestType === "QUOTE_CHANGE" && !sourceQuotationRevisionId) invalid("Báo giá nguồn là bắt buộc khi yêu cầu chỉnh sửa.");
    return {
      kind,
      requestType,
      customerSiteId: uuid(value(formData, "customerSiteId"), "Điểm giao"),
      materialId: uuid(value(formData, "materialId"), "Vật liệu"),
      quantity,
      uomId: uuid(value(formData, "uomId"), "Đơn vị tính"),
      note,
      ...(sourceSalesOrderId ? { sourceSalesOrderId: uuid(sourceSalesOrderId, "Đơn hàng nguồn") } : {}),
      ...(sourceQuotationRevisionId ? { sourceQuotationRevisionId: uuid(sourceQuotationRevisionId, "Báo giá nguồn") } : {}),
    };
  }
  if (kind === "customer.delivery.acknowledge") {
    return { kind, deliveryId: uuid(value(formData, "deliveryId"), "Phiếu giao") };
  }
  if (kind === "customer.delivery.issue") {
    const category = value(formData, "category") as CustomerDeliveryIssueCategory;
    if (!CUSTOMER_DELIVERY_ISSUE_CATEGORIES.includes(category)) invalid("Loại phản hồi giao hàng không hợp lệ.");
    const description = value(formData, "description");
    if (description.length < 10) invalid("Mô tả phản hồi cần ít nhất 10 ký tự.");
    if (description.length > 500) invalid("Mô tả phản hồi quá dài.");
    return { kind, deliveryId: uuid(value(formData, "deliveryId"), "Phiếu giao"), category, description };
  }
  if (kind === "customer.payment.notice") {
    const amount = value(formData, "amount");
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) invalid("Số tiền thông báo phải lớn hơn 0.");
    const transferredOn = value(formData, "transferredOn");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(transferredOn)) invalid("Ngày chuyển khoản không hợp lệ.");
    const bankReference = value(formData, "bankReference");
    const note = value(formData, "note");
    if (bankReference.length > 120 || note.length > 500) invalid("Nội dung thông báo quá dài.");
    const evidenceStoragePath = value(formData, "evidenceStoragePath");
    if (!/^[0-9a-fA-F-]{36}\/[A-Za-z0-9._/-]{1,420}$/.test(evidenceStoragePath)) {
      invalid("Hãy tải chứng từ thanh toán trước khi gửi thông báo.");
    }
    return { kind, amount, transferredOn, bankReference, note, evidenceStoragePath };
  }
  invalid("Thao tác cổng khách hàng không hợp lệ.");
}
