const choiceLabels: Record<string, string> = {
  BUSINESS: "Doanh nghiệp",
  INDIVIDUAL: "Cá nhân",
  EXACT: "Quy đổi chính xác",
  PACKAGING: "Theo quy cách đóng gói",
  ESTIMATED: "Ước lượng",
  MEASURED: "Đo thực tế",
  VEHICLE_LOAD: "Theo tải xe",
  HALF_UP: "Làm tròn gần nhất, từ 5 làm tròn lên",
  DOWN: "Làm tròn xuống",
  NONE: "Không cần",
  VEHICLE: "Cần xe",
  MACHINE: "Cần máy",
};

export function catalogChoiceLabel(value: string): string {
  return Object.hasOwn(choiceLabels, value) ? choiceLabels[value] : "Chưa xác định";
}
