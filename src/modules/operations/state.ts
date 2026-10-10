export const operationalLabels = {
 PENDING_OPENING: "Đang chuẩn bị số dư đầu kỳ",
 READY_FOR_ACTIVATION: "Đã đối chiếu đầu kỳ, chờ kích hoạt",
 ACTIVE: "Đang vận hành",
} as const;
export type OperationalState = keyof typeof operationalLabels;
export function operationalLabel(state: unknown): string {
 return typeof state === "string" && Object.hasOwn(operationalLabels, state)
  ? operationalLabels[state as OperationalState] : "Chưa xác minh trạng thái vận hành";
}
export function operationalNextStep(state: unknown): string {
 switch (state) {
  case "PENDING_OPENING": return "Cần hoàn tất nhập và đối chiếu số dư đầu kỳ trước khi kích hoạt vận hành.";
  case "READY_FOR_ACTIVATION": return "Đã đối chiếu số dư đầu kỳ. Chủ doanh nghiệp cần kiểm tra phương án khôi phục và xác nhận kích hoạt vận hành.";
  case "ACTIVE": return "Chi nhánh đã được kích hoạt vận hành. Các thao tác vẫn tuân theo quyền và quy định nghiệp vụ.";
  default: return "Chưa thể xác minh trạng thái. Kiểm tra lại kết nối hoặc liên hệ người quản trị trước khi ghi sổ.";
 }
}
export function activationIntent(branchId: string, version: number): string {
 return `ACTIVATE:${branchId}:${version}`;
}
