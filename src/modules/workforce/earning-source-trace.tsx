import { formatBusinessDateTime } from "@/lib/core/business-time";
import { formatVnd, vnd } from "@/lib/core/money";
import { financeSourceLabel } from "@/modules/finance/presentation";
export type EarningSource = {
  source_key: string; sales_order_id?: string | null; work_item_verification_id?: string | null;
  payment_allocation_id?: string | null; payment_id?: string | null; receivable_obligation_id?: string | null;
  reverses_earning_event_id?: string | null; basis_amount_vnd?: string | number | null; rate_bps_snapshot?: number | null;
  work_item_result_id?: string | null; work_item_id?: string | null; work_verified_at?: string | null;
  recognition_effective_at?: string | null; approved_at?: string | null; delivery_id?: string | null;
};
const dateTime = (value: string) => formatBusinessDateTime(value);
export function EarningSourceTrace({ source }: { source: EarningSource }) {
  return <small className="table-subline mono">
    {financeSourceLabel(source.source_key.split(":")[0])}
    {source.work_item_result_id && <span className="table-subline">Kết quả công việc: {source.work_item_result_id}</span>}
    {source.work_item_id && <span className="table-subline">Công việc: {source.work_item_id}</span>}
    {source.work_item_verification_id && <span className="table-subline">Xác minh của chủ doanh nghiệp: {source.work_item_verification_id}{source.work_verified_at && <> · {dateTime(source.work_verified_at)}</>}</span>}
    {source.sales_order_id && <span className="table-subline">Đơn bán: {source.sales_order_id}</span>}
    {source.delivery_id && <span className="table-subline">Phiếu giao: {source.delivery_id}</span>}
    {source.payment_allocation_id && <span className="table-subline">Phân bổ tiền thu: {source.payment_allocation_id}<br />Khoản phải thu: {source.receivable_obligation_id ?? "-"}<br />Phiếu thu: {source.payment_id ?? "-"}<br />Số tiền làm căn cứ: {source.basis_amount_vnd == null ? "Chưa có" : formatVnd(vnd(String(source.basis_amount_vnd)))} · {(Number(source.rate_bps_snapshot) / 100).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>}
    {source.reverses_earning_event_id && <span className="table-subline">Đảo khoản thu nhập: {source.reverses_earning_event_id}</span>}
    {source.recognition_effective_at && <span className="table-subline">Hiệu lực ghi nhận: {dateTime(source.recognition_effective_at)}</span>}
    {source.approved_at && <span className="table-subline">Đã duyệt: {dateTime(source.approved_at)}</span>}
  </small>;
}
