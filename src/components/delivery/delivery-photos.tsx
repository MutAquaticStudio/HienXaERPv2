import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { PhotoGrid } from "./photo-grid";

type Photo = { id: string; mimeType: string };
type Linked = { data: { evidence_id: unknown; portal_evidence_objects: unknown }[] | null; error: unknown } | null;

function photosOf(links: Linked): Photo[] {
  return (links?.data ?? []).map((row) => {
    const object = Array.isArray(row.portal_evidence_objects) ? row.portal_evidence_objects[0] : row.portal_evidence_objects;
    return { id: row.evidence_id as string, mimeType: (object as { mime_type?: string } | null)?.mime_type ?? "image/jpeg" };
  });
}

/**
 * A3b / FB7 "Ảnh giao hàng": the photos the worker took of the loaded truck and of the delivered goods, as thumbnails on the
 * delivery page. Opening them needs evidence.manage or delivery.verify (the same rule the file route applies); others see
 * how many there are.
 */
export async function DeliveryPhotos({ deliveryId, canView }: { deliveryId: string; canView: boolean }) {
  const supabase = await createServerSupabase();
  const [result, handoff] = await Promise.all([
    supabase.from("delivery_results").select("source_work_item_result_id, submitted_at, receiver_name")
      .eq("delivery_id", deliveryId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("delivery_handoffs").select("id, handed_off_at").eq("delivery_id", deliveryId)
      .order("handed_off_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const workResultId = result.data?.source_work_item_result_id as string | undefined;
  const handoffId = handoff.data?.id as string | undefined;
  const [deliveredLinks, loadedLinks] = await Promise.all([
    workResultId ? supabase.from("work_result_portal_evidence").select("evidence_id, portal_evidence_objects(mime_type)").eq("work_result_id", workResultId) : null,
    handoffId ? supabase.from("delivery_handoff_portal_evidence").select("evidence_id, portal_evidence_objects(mime_type)").eq("delivery_handoff_id", handoffId) : null,
  ]) as [Linked, Linked];
  if (deliveredLinks?.error || loadedLinks?.error) return <section className="card card-pad"><h2>Ảnh giao hàng</h2><p role="alert">Chưa tải được ảnh. Tải lại trang.</p></section>;
  const delivered = photosOf(deliveredLinks), loaded = photosOf(loadedLinks);
  if (!delivered.length && !loaded.length) return null;
  return <section className="card card-pad" aria-labelledby="delivery-photos-heading">
    <div className="section-head flush"><h2 id="delivery-photos-heading">Ảnh giao hàng</h2><span className="scope-chip">{delivered.length + loaded.length} ảnh</span></div>
    {!canView ? <p className="muted">Cần quyền xác minh giao hàng để xem ảnh.</p> : <>
      {loaded.length > 0 && <>
        <h3>Lấy hàng lên xe</h3>
        <p className="muted">Thợ chụp lúc {formatBusinessDateTime(handoff.data!.handed_off_at as string)}.</p>
        <PhotoGrid photos={loaded} />
      </>}
      {delivered.length > 0 && <>
        {loaded.length > 0 && <h3>Đã giao</h3>}
        <p className="muted">Thợ gửi lúc {formatBusinessDateTime(result.data!.submitted_at as string)}{result.data!.receiver_name ? ` · người nhận ${result.data!.receiver_name}` : ""}.</p>
        <PhotoGrid photos={delivered} />
      </>}
    </>}
  </section>;
}
