import { operationalPostingError, quantityInputError } from "@/lib/core/errors";

/** Vietnamese message for a delivery command refusal; never shows the technical code. */
export function deliveryCommandMessage(value?: string) {
  const postingError = operationalPostingError(value);
  if (postingError) return postingError;
  const quantityError = quantityInputError(value);
  if (quantityError) return quantityError;
  if (value?.includes("worker_quantity_adjustment_reason_required")) return "Nhập lý do điều chỉnh số lượng thợ đã gửi (từ 3 đến 500 ký tự), rồi xác minh lại.";
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("delivery_reassignment_after_work_started_forbidden")) return "Công việc đã bắt đầu. Không thể đổi phân giao; cần xử lý bàn giao có căn cứ.";
  if (value?.includes("delivery_external_assignment_with_work_forbidden")) return "Phiếu đã có công việc nội bộ. Không thể đổi sang xe ngoài bằng thao tác phân giao này.";
  if (value?.includes("schedule_collision")) return "Người giao hoặc xe đã được phân trong khung giờ này. Chọn lịch hoặc tài nguyên khác.";
  if (value?.includes("schedule_window")) return "Nhập giờ bắt đầu và giờ kết thúc sau giờ bắt đầu.";
  if (value?.includes("delivery_employee_cannot_report_work")) return "Người giao phải có tài khoản đang hoạt động và quyền nhận, báo kết quả công việc trong chi nhánh.";
  if (value?.includes("vehicle_actual_cargo_capacity_exceeded")) return "Tổng hàng thực lấy và hàng còn trên xe vượt sức chứa đã xác minh. Xử lý hàng của phiếu trước hoặc chọn xe phù hợp trước khi bàn giao.";
  if (value?.includes("vehicle_cargo_source_requires_reconciliation")) return "Dữ liệu hàng còn trên xe chưa khớp nguồn. Đối chiếu bàn giao, xác minh và xử lý hàng còn trước khi lấy thêm.";
  if (value?.includes("vehicle_capacity_exceeded")) return "Lượng kế hoạch vượt sức chứa đã khai báo của xe. Chọn xe phù hợp hoặc tách phiếu giao.";
  if (value?.includes("vehicle_capacity")) return "Chưa đủ dữ liệu kiểm tra tải xe. Kiểm tra sức chứa, đơn vị và căn cứ quy đổi trong danh mục.";
  if (value?.includes("delivery_loaded_quantity_exceeds_plan")) return "Lượng thực lấy vượt kế hoạch. Kiểm tra lại từng dòng trước khi bàn giao.";
  if (value?.includes("delivery_loading")) return "Nhập lượng thực lấy cho đủ từng dòng; ít nhất một dòng phải có hàng.";
  if (value?.includes("order_not_ready_for_delivery")) return "Đơn bán chưa được xác nhận hoặc đã đóng; chưa lập phiếu giao được.";
  if (value?.includes("delivery_line_source_invalid_or_duplicate")) return "Có dòng không thuộc đơn này hoặc bị lặp. Tải lại đơn rồi thử lại.";
  if (value?.includes("allocation_capacity") || value?.includes("allocation_exceeds")) return "Số lượng vượt phần còn phải giao của đơn.";
  if (value?.includes("warehouse_invalid")) return "Kho không còn hoạt động ở chi nhánh này. Chọn kho khác.";
  if (value?.includes("delivery_multiple_pickups_require_split")) return "Các kho hoặc điểm lấy khác nhau cần tách phiếu giao để ghi đúng từng lần lấy hàng.";
  if (value?.includes("invalid_delivery_result_line")) return "Lượng báo giao không được vượt lượng thực đã lấy lên xe.";
  if (value?.includes("version")) return "Phiếu đã được người khác cập nhật. Hãy tải lại.";
  if (value?.includes("inventory") || value?.includes("reservation")) return "Tồn khả dụng hoặc lượng hàng đã giữ không còn đủ.";
  if (value?.includes("billing")) return "Lượng tính tiền khác lượng nhận cần quyền và lý do.";
  if (value?.includes("exceeds")) return "Số lượng vượt phần còn lại của nguồn.";
  return "Không thể hoàn tất thao tác giao hàng. Vui lòng thử lại.";
}
