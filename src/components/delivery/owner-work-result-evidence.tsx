import { createServerSupabase } from "@/lib/supabase/server";
import { PhotoGrid } from "./photo-grid";

export async function OwnerWorkResultEvidence({ deliveryId }: { deliveryId: string }) {
  const supabase = await createServerSupabase();
  const result = await supabase.from("delivery_results").select("source_work_item_result_id")
    .eq("delivery_id", deliveryId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) return <p role="alert">Chưa tải được kết quả thợ. Hãy tải lại trước khi xác minh.</p>;
  if (!result.data?.source_work_item_result_id) return null;
  const evidence = await supabase.from("work_result_portal_evidence").select("evidence_id, portal_evidence_objects(mime_type)")
    .eq("work_result_id", result.data.source_work_item_result_id);
  const photos = (evidence.data ?? []).map((row) => {
    const object = Array.isArray(row.portal_evidence_objects) ? row.portal_evidence_objects[0] : row.portal_evidence_objects;
    return { id: row.evidence_id as string, mimeType: (object as { mime_type?: string } | null)?.mime_type ?? "image/jpeg" };
  });
  return <section className="field field-full" aria-label="Kết quả và bằng chứng thợ gửi">
    <strong>Ảnh / tài liệu thợ gửi</strong>
    {evidence.error ? <p role="alert">Chưa tải được bằng chứng. Không coi là đã kiểm tra.</p>
      : photos.length ? <PhotoGrid photos={photos} label="Ảnh thợ gửi" />
      : <p className="muted">Kết quả này chưa kèm ảnh / tài liệu.</p>}
    <label htmlFor="verificationAdjustmentReason">Lý do điều chỉnh số lượng thợ (nếu thay đổi)</label>
    <input id="verificationAdjustmentReason" name="verificationAdjustmentReason" maxLength={500} placeholder="Giữ nguyên kết quả thợ; ghi rõ lý do cho số lượng chủ doanh nghiệp xác minh." />
  </section>;
}
