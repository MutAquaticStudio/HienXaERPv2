import type { createServerSupabase } from "@/lib/supabase/server";
import { aiUsageCostUsd } from "@/modules/ai/usage";

type Usage = { model: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; outcome: string };

/** The month's API cost (D36, moved to Cài đặt → Trợ lý AI in D66: the chat itself now lives only in Tin nhắn). */
export async function AiUsageCard({ supabase, branchId }: { supabase: Awaited<ReturnType<typeof createServerSupabase>>; branchId: string }) {
  const monthStart = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).slice(0, 8)}01T00:00:00+07:00`;
  const { data, error } = await supabase.from("ai_usage_log").select("model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, outcome")
    .eq("branch_id", branchId).gte("created_at", monthStart).limit(10000);
  if (error) return <p className="form-message" role="alert">Chưa tải được chi phí AI tháng này. Tải lại trang.</p>;
  const usage = data as Usage[];
  const totals = usage.reduce((sum, row) => ({ input: sum.input + row.input_tokens, output: sum.output + row.output_tokens, cacheRead: sum.cacheRead + row.cache_read_tokens, cacheWrite: sum.cacheWrite + row.cache_write_tokens }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  // D50: each call is priced at the model it used.
  const costUsd = usage.reduce((sum, row) => sum + aiUsageCostUsd({ input: row.input_tokens, output: row.output_tokens, cacheRead: row.cache_read_tokens, cacheWrite: row.cache_write_tokens }, row.model), 0);
  const quotaHit = usage.some((row) => row.outcome === "QUOTA");
  return <section className="card card-pad" aria-label="Chi phí AI tháng này">
    <h2>Chi phí AI tháng này</h2>
    <p className="metric-value">≈ {costUsd.toLocaleString("vi-VN", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</p>
    <p className="muted">{usage.length} lượt hỏi · {(totals.input + totals.cacheRead + totals.cacheWrite).toLocaleString("vi-VN")} token đọc · {totals.output.toLocaleString("vi-VN")} token trả lời. Tính theo giá niêm yết của mô hình từng lượt hỏi (Sonnet 5.5: 2 USD / 10 USD mỗi triệu token đọc / trả lời).</p>
    {quotaHit && <p className="form-message" role="status">Tháng này đã có lượt hỏi bị từ chối vì hết hạn mức API. Nạp thêm tín dụng tại tài khoản Anthropic.</p>}
  </section>;
}
