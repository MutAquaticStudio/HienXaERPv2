export function ActionNotice({ notice, error }: { notice?: string; error?: string }) {
  if (error) return <p className="form-message" role="alert">{error}</p>;
  if (!notice) return null;
  const labels: Record<string, string> = { created: "Đã lưu bản nháp.", confirmed: "Đã xác nhận đơn và giữ hạn mức tín dụng.", cancelled: "Đã hủy đơn và giải phóng phần hạn mức còn lại.", sent: "Đã gửi đúng phiên bản báo giá.", accepted: "Đã ghi nhận chấp nhận phiên bản báo giá.", revised: "Đã tạo revision mới từ snapshot trước.", "from-quote": "Đã tạo đơn bán từ đúng revision báo giá." };
  return <p className="form-message success" role="status">{labels[notice] ?? "Thao tác đã hoàn tất."}</p>;
}
