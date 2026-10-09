export const operationalLabels = {
 PENDING_OPENING: "Đang chuẩn bị số dư đầu kỳ",
 READY_FOR_ACTIVATION: "Đã đối soát đầu kỳ, chờ kích hoạt",
 ACTIVE: "Đang vận hành",
} as const;
export type OperationalState = keyof typeof operationalLabels;
export function operationalLabel(state: unknown): string {
 return typeof state === "string" && state in operationalLabels
  ? operationalLabels[state as OperationalState] : "Chưa xác minh trạng thái vận hành";
}
export function activationIntent(branchId: string, version: number): string {
 return `ACTIVATE:${branchId}:${version}`;
}
