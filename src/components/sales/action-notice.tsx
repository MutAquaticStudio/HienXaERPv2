export function ActionNotice({ notice, error }: { notice?: string; error?: string }) {
  if (error) return <p className="form-message" role="alert">{error}</p>;
  if (!notice) return null;
  const labels: Record<string, string> = { created: "Đã lưu bản nháp.", confirmed: "Đã xác nhận chứng từ.", cancelled: "Đã hủy chứng từ và giải phóng phần allocation/commitment liên quan.", sent: "Đã gửi đúng phiên bản báo giá.", accepted: "Đã ghi nhận chấp nhận phiên bản báo giá.", revised: "Đã tạo revision mới từ snapshot trước.", "from-quote": "Đã tạo đơn bán từ đúng revision báo giá.", "created-direct": "Đã tạo PO giao thẳng và phân nguồn cho đúng dòng bán.", "created-linked": "Đã tạo PO và SO draft liên kết trong cùng thao tác." };
  return <p className="form-message success" role="status">{labels[notice] ?? "Thao tác đã hoàn tất."}</p>;
}
