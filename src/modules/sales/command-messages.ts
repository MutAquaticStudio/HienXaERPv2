// Vietnamese messages of the sales commands' refusals; shared by the order screen and the Excel import.
import { operationalPostingError, quantityInputError } from "@/lib/core/errors";

export { creditBlockOf } from "./credit-block";

export function commandError(message: string, confirmingOrder = false) {
  const postingError = operationalPostingError(message, confirmingOrder ? "sales-order-confirmation" : "posting");
  if (postingError) return postingError;
  const quantityError = quantityInputError(message);
  if (quantityError) return quantityError;
  if (message.includes("pricing_rule_priority_mismatch") || message.includes("pricing_source_snapshot_mismatch")) return "Bảng giá hoặc nguồn giá đã thay đổi. Tải lại và xem trước giá, hoặc nhập giá thủ công.";
  if (message.includes("pricing_priority_ambiguous")) return "Có nhiều bảng giá cùng mức ưu tiên và phiên bản. Cần đối chiếu bảng giá hoặc dùng giá thủ công được phê duyệt.";
  if (message.includes("sales_order_not_confirmable")) return "Đơn bán không còn ở trạng thái có thể xác nhận. Hãy tải lại để kiểm tra.";
  if (message.includes("order_lines_required")) return "Vui lòng thêm ít nhất một dòng vật tư cho đơn bán.";
  if (message.includes("discount_requires_permission")) return "Bạn không có quyền giảm giá. Bỏ giảm giá hoặc nhờ người quản lý giá.";
  if (message.includes("invalid_discount")) return "Giảm giá không hợp lệ: phải nhỏ hơn đơn giá, phần trăm dưới 100%. Kiểm tra lại từng dòng.";
  if (confirmingOrder && message.includes("forbidden")) return "Bạn không có quyền xác nhận đơn bán tại chi nhánh này.";
  if (message.includes("sales_order_unresolved_execution")) return "Còn giao hàng, việc hoặc hàng đang vận chuyển chưa xử lý. Hãy hoàn tất trước khi đóng phần còn lại.";
  if (message.includes("sales_order_has_no_remaining")) return "Đơn không còn số lượng chưa giao để đóng.";
  if (message.includes("sales_order_not_closeable")) return "Đơn không còn ở trạng thái có thể đóng phần còn lại. Hãy tải lại.";
  if (message.includes("credit_limit_exceeded")) return "Hạn mức tín dụng không đủ để xác nhận đơn.";
  if (message.includes("credit_limit_not_approved")) return "Khách hàng chưa có hạn mức tín dụng được duyệt.";
  if (message.includes("overdue_receivable_blocks_credit")) return "Khách hàng có công nợ quá hạn; chưa thể xác nhận đơn.";
  if (message.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại màn hình.";
  if (message.includes("draft_version_conflict")) return "Bản nháp đã được người khác sửa. Hãy tải lại trước khi tiếp tục.";
  if (message.includes("not_editable")) return "Chứng từ không còn là bản nháp có thể sửa. Hãy tải lại màn hình.";
  if (message.includes("not_acceptable")) return "Phiên bản báo giá này không còn có thể chấp nhận.";
  return "Thao tác không hoàn tất. Dữ liệu chưa được xác nhận.";
}
