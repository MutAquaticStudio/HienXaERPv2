function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function invoiceStateLabel(value?: string | null) {
  return lookupLabel({ DRAFT: "Nháp rà soát", BUSINESS_APPROVED: "Đã duyệt nguồn", CANCELLED: "Đã hủy", PENDING_DOCUMENT: "Chờ chứng từ", SOURCE_EVIDENCE_ATTACHED: "Đã gắn minh chứng nguồn" }, value, "Trạng thái đang cập nhật");
}
