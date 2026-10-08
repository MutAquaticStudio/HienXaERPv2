export type EarningSource = {
  source_key: string; sales_order_id?: string | null; work_item_verification_id?: string | null;
  payment_allocation_id?: string | null; payment_id?: string | null; receivable_obligation_id?: string | null;
  reverses_earning_event_id?: string | null; basis_amount_vnd?: string | number | null; rate_bps_snapshot?: number | null;
  work_item_result_id?: string | null; work_item_id?: string | null; work_verified_at?: string | null;
  recognition_effective_at?: string | null; approved_at?: string | null; delivery_id?: string | null;
};
const dateTime = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));
export function EarningSourceTrace({ source }: { source: EarningSource }) {
  return <small className="table-subline mono">
    {source.source_key}
    {source.work_item_result_id && <span className="table-subline">Work Result: {source.work_item_result_id}</span>}
    {source.work_item_id && <span className="table-subline">Work: {source.work_item_id}</span>}
    {source.work_item_verification_id && <span className="table-subline">Owner verification: {source.work_item_verification_id}{source.work_verified_at && <> · {dateTime(source.work_verified_at)}</>}</span>}
    {source.sales_order_id && <span className="table-subline">SO: {source.sales_order_id}</span>}
    {source.delivery_id && <span className="table-subline">Delivery: {source.delivery_id}</span>}
    {source.payment_allocation_id && <span className="table-subline">AR allocation: {source.payment_allocation_id}<br />AR: {source.receivable_obligation_id ?? "-"}<br />Payment: {source.payment_id ?? "-"}<br />Eligible VND: {String(source.basis_amount_vnd)} · {(Number(source.rate_bps_snapshot) / 100).toFixed(2)}%</span>}
    {source.reverses_earning_event_id && <span className="table-subline">Reversal of earning: {source.reverses_earning_event_id}</span>}
    {source.recognition_effective_at && <span className="table-subline">Recognition effective: {dateTime(source.recognition_effective_at)}</span>}
    {source.approved_at && <span className="table-subline">Approved: {dateTime(source.approved_at)}</span>}
  </small>;
}
