import Link from "next/link";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { activeTab, DetailTabs } from "@/components/ui/detail-tabs";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { AiChat, DecideProposalForm } from "@/modules/ai/chat";
import { AI_MODULES, aiModuleLabels, type AiModule } from "@/modules/ai/sources";
import { aiUsageCostUsd } from "@/modules/ai/usage";

type Proposal = { id: string; module: string; title: string; body: string; link_path: string | null; state: string; created_at: string };
type Usage = { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number; outcome: string };

/** FB12 (D34d): "Trợ lý AI" — hỏi đáp theo từng mảng, đề xuất chờ duyệt, chi phí API trong tháng. */
export default async function AiPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const access = await requireInternalPermission("ai.use");
  const canManage = access.permissions.has("ai.manage");
  const tabs = AI_MODULES.map((id) => ({ id, label: aiModuleLabels[id] }));
  const scope = activeTab(tabs, (await searchParams).module) as AiModule;
  const supabase = await createServerSupabase();
  const monthStart = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).slice(0, 8)}01T00:00:00+07:00`;
  const [proposalsResult, usageResult] = await Promise.all([
    supabase.from("ai_proposals").select("id, module, title, body, link_path, state, created_at").eq("branch_id", access.branchId).eq("state", "PENDING").order("created_at", { ascending: false }).limit(30),
    canManage ? supabase.from("ai_usage_log").select("input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, outcome").eq("branch_id", access.branchId).gte("created_at", monthStart).limit(10000)
      : Promise.resolve({ data: [] as Usage[], error: null }),
  ]);
  if (proposalsResult.error || usageResult.error) throw new Error("Không tải được trợ lý AI. Vui lòng thử lại.");
  const proposals = proposalsResult.data as Proposal[];
  const usage = usageResult.data as Usage[];
  const totals = usage.reduce((sum, row) => ({ input: sum.input + row.input_tokens, output: sum.output + row.output_tokens, cacheRead: sum.cacheRead + row.cache_read_tokens, cacheWrite: sum.cacheWrite + row.cache_write_tokens }), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const quotaHit = usage.some((row) => row.outcome === "QUOTA");

  return <>
    <header className="page-heading">
      <div><p className="eyebrow">Trợ lý AI (Claude)</p><h1>Hỏi AI</h1>
        <p className="lede">Trợ lý đọc số liệu theo quyền của bạn và trả lời bằng tiếng Việt. Trợ lý không tự ghi sổ: việc cần thay đổi được ghi thành đề xuất để người quản lý duyệt.</p></div>
    </header>
    <DetailTabs tabs={tabs} active={scope} href={(id) => `/admin/ai?module=${id}`} label="Phạm vi trợ lý" />
    <div className="two-column ai-layout">
      <AiChat key={scope} module={scope} moduleLabel={aiModuleLabels[scope]} />
      <aside className="page-stack">
        {canManage && <section className="card card-pad" aria-label="Chi phí AI tháng này">
          <h2>Chi phí AI tháng này</h2>
          <p className="metric-value">≈ {aiUsageCostUsd(totals).toLocaleString("vi-VN", { style: "currency", currency: "USD", maximumFractionDigits: 2 })}</p>
          <p className="muted">{usage.length} lượt hỏi · {(totals.input + totals.cacheRead + totals.cacheWrite).toLocaleString("vi-VN")} token đọc · {totals.output.toLocaleString("vi-VN")} token trả lời. Giá Claude Sonnet: 2 USD / 1 triệu token đọc, 10 USD / 1 triệu token trả lời.</p>
          {quotaHit && <p className="form-message" role="status">Tháng này đã có lượt hỏi bị từ chối vì hết hạn mức API. Nạp thêm tín dụng tại tài khoản Anthropic.</p>}
        </section>}
        <section className="card card-pad" aria-label="Đề xuất chờ duyệt">
          <h2>Đề xuất chờ duyệt</h2>
          {proposals.length ? <ul className="ai-proposals">{proposals.map((proposal) => <li key={proposal.id}>
            <strong>{proposal.title}</strong>
            <small className="table-subline">{aiModuleLabels[proposal.module as AiModule] ?? proposal.module} · {formatBusinessDateTime(proposal.created_at)}</small>
            <p>{proposal.body}</p>
            <div className="action-cluster">
              {proposal.link_path && <Link className="button button-secondary button-compact" href={proposal.link_path}>Mở màn hình thực hiện</Link>}
              {canManage && <><DecideProposalForm proposalId={proposal.id} decision="DONE" /><DecideProposalForm proposalId={proposal.id} decision="DISMISSED" /></>}
            </div>
          </li>)}</ul> : <p className="muted">Không có đề xuất nào đang chờ.</p>}
        </section>
      </aside>
    </div>
  </>;
}
