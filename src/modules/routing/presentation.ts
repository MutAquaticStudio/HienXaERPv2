function lookupLabel(labels: Record<string, string>, value: string | null | undefined, fallback: string) {
  return value && Object.hasOwn(labels, value) ? labels[value] : fallback;
}

export function routePlanStateLabel(value?: string | null) {
  return lookupLabel({ DRAFT: "Bản đề xuất", APPLIED: "Đã phân giao", CANCELLED: "Đã hủy" }, value, "Trạng thái đang cập nhật");
}
