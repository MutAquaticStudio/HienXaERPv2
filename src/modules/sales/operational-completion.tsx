import { createServerSupabase } from "@/lib/supabase/server";

type Operational = { commercial_state: string; delivery_state: string; payment_state: string; operational_complete: boolean; exceptions: Record<string, boolean>; delivery_model: string; trip_grouping_supported: boolean };
const exceptions: Record<string, string> = { cargo_remaining: "Còn hàng thực trên xe", physical_return_open: "Hồ sơ trả / hao hụt chưa xử lý", customer_credit_decision_pending: "Trả khách chưa có quyết định tài chính", customer_refund_offset_pending: "Tiền khách cần hoàn / cấn trừ chưa xong", supplier_return_or_money_pending: "Trả nhà cung cấp hoặc tiền hoàn / bù trừ chưa xong", paid_commission_review_pending: "Hoa hồng đã trả cần quyết định đối chiếu", work_item_open: "Công việc giao hàng chưa xác minh / đóng", supplier_document_variance_open: "Chứng từ nhà cung cấp còn lệch nguồn", legacy_debt_reconciliation_required: "Nguồn công nợ cần đối chiếu" };
export async function OperationalCompletion({ orderId }: { orderId: string }) {
 const db = await createServerSupabase(); const { data, error } = await db.rpc("sales_order_operational_snapshot", { target_order_id: orderId }); if (error || !data) throw new Error("Không thể xác định điều kiện hoàn tất vận hành."); const state = data as Operational;
 const pending = Object.entries(state.exceptions).filter(([, active]) => active).map(([key]) => exceptions[key] || "Còn ngoại lệ nguồn");
 if (pending.length === 0) return null;
 return <section className="quality-callout operational-exceptions" data-operational-complete={String(state.operational_complete)} aria-label="Ngoại lệ còn mở"><h2>Cần xử lý trước khi hoàn tất</h2><ul className="clean-list">{pending.map(text => <li key={text}>{text}</li>)}</ul></section>;
}
