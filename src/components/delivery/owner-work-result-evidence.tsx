import { createServerSupabase } from "@/lib/supabase/server";

export async function OwnerWorkResultEvidence({ deliveryId }: { deliveryId: string }) {
  const supabase = await createServerSupabase();
  const result = await supabase.from("delivery_results").select("source_work_item_result_id")
    .eq("delivery_id", deliveryId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) return <p role="alert">Chưa tải được kết quả thợ. Hãy tải lại trước khi xác minh.</p>;
  if (!result.data?.source_work_item_result_id) return null;
  const evidence = await supabase.from("work_result_portal_evidence").select("evidence_id")
    .eq("work_result_id", result.data.source_work_item_result_id);
  return <section className="field field-full" aria-label="Kết quả và bằng chứng thợ gửi">
    <strong>Ảnh / tài liệu thợ gửi</strong>
    {evidence.error ? <p role="alert">Chưa tải được bằng chứng. Không coi là đã kiểm tra.</p>
      : evidence.data?.length ? <div className="form-actions">{evidence.data.map(item => <a key={item.evidence_id} className="button button-secondary" href={`/api/evidence/${encodeURIComponent(item.evidence_id)}/signed`} target="_blank" rel="noopener noreferrer">Mở bằng chứng</a>)}</div>
      : <p className="muted">Kết quả này chưa kèm ảnh / tài liệu.</p>}
    <label htmlFor="verificationAdjustmentReason">Lý do điều chỉnh số lượng thợ (nếu thay đổi)</label>
    <input id="verificationAdjustmentReason" name="verificationAdjustmentReason" maxLength={500} placeholder="Giữ nguyên kết quả thợ; ghi rõ lý do cho số lượng Owner xác minh." />
  </section>;
}
