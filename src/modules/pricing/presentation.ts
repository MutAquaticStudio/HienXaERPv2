const sourceLabels: Record<string, string> = {
  LIST: "Bảng giá",
  CONTRACT: "Hợp đồng",
  MANUAL_APPROVED: "Giá nhập đã duyệt",
};

const scopeLabels: Record<string, string> = {
  DEFAULT: "Giá mặc định theo vật tư",
  CUSTOMER_MATERIAL: "Khách hàng và vật tư",
  CUSTOMER_GROUP: "Khách hàng và nhóm vật tư",
  CUSTOMER_TIER: "Nhóm giá khách hàng và vật tư",
};

export function priceSourceLabel(value?: string | null): string {
  return value ? Object.hasOwn(sourceLabels, value) ? sourceLabels[value] : "Nguồn giá chưa xác định" : "Chưa có nguồn giá";
}

export function pricingScopeLabel(value: string): string {
  return Object.hasOwn(scopeLabels, value) ? scopeLabels[value] : "Phạm vi giá chưa xác định";
}
