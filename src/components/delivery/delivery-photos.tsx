import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { PhotoGrid } from "./photo-grid";

/**
 * A3b "Ảnh giao hàng": the photos the worker sent with the delivery result, as thumbnails on the delivery page. Opening
 * them needs evidence.manage or delivery.verify (the same rule the file route applies); others see how many there are.
 */
export async function DeliveryPhotos({ deliveryId, canView }: { deliveryId: string; canView: boolean }) {
  const supabase = await createServerSupabase();
  const result = await supabase.from("delivery_results").select("source_work_item_result_id, submitted_at, receiver_name")
    .eq("delivery_id", deliveryId).order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error || !result.data?.source_work_item_result_id) return null;
  const links = await supabase.from("work_result_portal_evidence").select("evidence_id, portal_evidence_objects(mime_type)")
    .eq("work_result_id", result.data.source_work_item_result_id);
  if (links.error) return <section className="card card-pad"><h2>Ảnh giao hàng</h2><p role="alert">Chưa tải được ảnh. Tải lại trang.</p></section>;
  const photos = (links.data ?? []).map((row) => {
    const object = Array.isArray(row.portal_evidence_objects) ? row.portal_evidence_objects[0] : row.portal_evidence_objects;
    return { id: row.evidence_id as string, mimeType: (object as { mime_type?: string } | null)?.mime_type ?? "image/jpeg" };
  });
  if (!photos.length) return null;
  return <section className="card card-pad" aria-labelledby="delivery-photos-heading">
    <div className="section-head flush"><h2 id="delivery-photos-heading">Ảnh giao hàng</h2><span className="scope-chip">{photos.length} ảnh</span></div>
    <p className="muted">Thợ gửi lúc {formatBusinessDateTime(result.data.submitted_at as string)}{result.data.receiver_name ? ` · người nhận ${result.data.receiver_name}` : ""}.</p>
    {canView ? <PhotoGrid photos={photos} /> : <p className="muted">Cần quyền xác minh giao hàng để xem ảnh.</p>}
  </section>;
}
