import { operationalPostingError, quantityInputError } from "@/lib/core/errors";

/** Vietnamese message for a rejected inventory command (receipts, supplier fulfilment, stock counts). */
export function inventoryCommandMessage(value?: string) {
  const postingError = operationalPostingError(value);
  if (postingError) return postingError;
  const quantityError = quantityInputError(value);
  if (quantityError) return quantityError;
  if (value?.includes("stock_count_cutoff_stale") || value?.includes("stock_count_basis_changed_recount_required")) return "Kho đã có biến động làm căn cứ đếm không còn hợp lệ. Giữ hồ sơ chênh lệch, đối chiếu biến động và kiểm kê lại tại mốc mới trước khi duyệt.";
  if (value?.includes("stock_count_adjustment_below_reserved_or_on_hand")) return "Chưa thể duyệt: lượng sau điều chỉnh thấp hơn lượng đang giữ chỗ hoặc làm tồn kho âm. Hãy đối chiếu hàng và các phiếu giữ chỗ.";
  if (value?.includes("stock_count_inventory_value_inconsistent")) return "Chưa thể duyệt: lượng và giá trị tồn sau điều chỉnh không khớp. Hãy kiểm tra căn cứ giá vốn.";
  if (value?.includes("variance_reason_required")) return "Chưa ghi được ghi chú cho dòng có chênh lệch. Tải lại phiếu rồi lưu lại.";
  if (value?.includes("duplicate_stock_count_line")) return "Một vật tư xuất hiện hai lần trong phiếu kiểm. Hãy tải lại trang.";
  if (value?.includes("invalid_stock_count_lines")) return "Chưa có số đếm hợp lệ để lưu.";
  if (value?.includes("cancel_reason_required")) return "Chưa hủy được phiếu. Tải lại trang rồi thử lại.";
  if (value?.includes("stock_count_not_approvable")) return "Phiếu kiểm chưa có dòng nào hoặc đã thay đổi. Hãy tải lại trang.";
  if (value?.includes("stock_count_version_conflict")) return "Phiếu kiểm đã thay đổi (vừa được lưu ở nơi khác, đã cân bằng hoặc đã hủy). Hãy tải lại trang.";
  if (value?.includes("adjustment_cost_required")) return "Vật tư chưa có giá vốn: nhập giá vốn cho dòng tăng tồn.";
  if (value?.includes("adjustment_value_too_small")) return "Chênh lệch quá nhỏ để ghi giá trị tồn. Kiểm tra lại số đếm.";
  if (value?.includes("material_not_found")) return "Vật tư không còn dùng. Bỏ dòng đó hoặc tải lại trang.";
  if (value?.includes("operation_payload_conflict")) return "Mã thao tác đã được dùng với dữ liệu khác. Hãy tải lại.";
  if (value?.includes("exceeds")) return "Số lượng vượt phần còn lại của chứng từ nguồn.";
  if (value?.includes("version")) return "Dữ liệu đã được người khác cập nhật. Hãy tải lại.";
  if (value?.includes("cost")) return "Thiếu căn cứ giá vốn hợp lệ.";
  return "Không thể ghi nhận nghiệp vụ kho. Không có thay đổi nào được chốt.";
}
