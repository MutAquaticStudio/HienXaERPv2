import Link from "next/link";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { createServerSupabase } from "@/lib/supabase/server";
import { evidenceContentType } from "@/modules/delivery/evidence-type";
import { PhotoGrid, type EvidencePhoto } from "./photo-grid";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
type Linked = { data: { evidence_id: unknown; portal_evidence_objects: unknown }[] | null; error: unknown } | null;

function photosOf(links: Linked): EvidencePhoto[] {
  return (links?.data ?? []).map((row) => {
    const object = Array.isArray(row.portal_evidence_objects) ? row.portal_evidence_objects[0] : row.portal_evidence_objects;
    return { id: row.evidence_id as string, mimeType: (object as { mime_type?: string } | null)?.mime_type ?? "image/jpeg" };
  });
}

export type DeliveryPhotoSet = {
  loaded: EvidencePhoto[]; loadedAt: string | null;
  delivered: EvidencePhoto[]; deliveredAt: string | null; receiver: string | null; failed: boolean;
};

/**
 * The photos of one delivery: the worker's photos of the loaded truck and of the delivered goods (portal), and the file
 * uploaded in the office with the result ("Tải bằng chứng lên" — "NCC đã giao", "Làm thay thợ").
 */
export async function loadDeliveryPhotos(supabase: Supabase, deliveryId: string, withInternal: boolean): Promise<DeliveryPhotoSet> {
  const [result, handoff] = await Promise.all([
    supabase.from("delivery_results").select("source_work_item_result_id, evidence_object_id, submitted_at, receiver_name")
      .eq("delivery_id", deliveryId).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("delivery_handoffs").select("id, handed_off_at").eq("delivery_id", deliveryId)
      .order("handed_off_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const workResultId = result.data?.source_work_item_result_id as string | undefined;
  const internalId = withInternal ? result.data?.evidence_object_id as string | undefined : undefined;
  const handoffId = handoff.data?.id as string | undefined;
  const [deliveredLinks, loadedLinks, internal] = await Promise.all([
    workResultId ? supabase.from("work_result_portal_evidence").select("evidence_id, portal_evidence_objects(mime_type)").eq("work_result_id", workResultId) : null,
    handoffId ? supabase.from("delivery_handoff_portal_evidence").select("evidence_id, portal_evidence_objects(mime_type)").eq("delivery_handoff_id", handoffId) : null,
    internalId ? supabase.from("evidence_objects").select("id, object_path").eq("id", internalId).eq("upload_state", "VERIFIED").maybeSingle() : null,
  ]) as [Linked, Linked, { data: { id: string; object_path: string } | null; error: unknown } | null];
  const failed = Boolean(result.error || handoff.error || deliveredLinks?.error || loadedLinks?.error || internal?.error);
  const office: EvidencePhoto[] = internal?.data ? [{ id: internal.data.id, mimeType: evidenceContentType(internal.data.object_path), source: "internal" }] : [];
  return {
    loaded: photosOf(loadedLinks), loadedAt: (handoff.data?.handed_off_at as string | undefined) ?? null,
    delivered: [...photosOf(deliveredLinks), ...office], deliveredAt: (result.data?.submitted_at as string | undefined) ?? null,
    receiver: (result.data?.receiver_name as string | null | undefined) ?? null, failed,
  };
}

function PhotoSections({ set, headingLevel }: { set: DeliveryPhotoSet; headingLevel: "h3" | "h4" }) {
  const Heading = headingLevel;
  return <>
    {set.loaded.length > 0 && <>
      <Heading>Lấy hàng lên xe</Heading>
      {set.loadedAt && <p className="muted">Chụp lúc {formatBusinessDateTime(set.loadedAt)}.</p>}
      <PhotoGrid photos={set.loaded} label="Ảnh lấy hàng lên xe" />
    </>}
    {set.delivered.length > 0 && <>
      <Heading>Đã giao</Heading>
      {set.deliveredAt && <p className="muted">Gửi lúc {formatBusinessDateTime(set.deliveredAt)}{set.receiver ? ` · người nhận ${set.receiver}` : ""}.</p>}
      <PhotoGrid photos={set.delivered} label="Ảnh đã giao" />
    </>}
  </>;
}

/**
 * A3b / FB7 / FB11 "Ảnh giao hàng" on the delivery page. Worker photos open with evidence.manage or delivery.verify (the rule
 * of the portal file route); a file uploaded in the office needs evidence.manage (the rule of internal storage).
 */
export async function DeliveryPhotos({ deliveryId, canView, canViewInternal }: { deliveryId: string; canView: boolean; canViewInternal: boolean }) {
  const supabase = await createServerSupabase();
  const set = await loadDeliveryPhotos(supabase, deliveryId, canViewInternal);
  if (set.failed) return <section className="card card-pad"><h2>Ảnh giao hàng</h2><p role="alert">Chưa tải được ảnh. Tải lại trang.</p></section>;
  const count = set.loaded.length + set.delivered.length;
  if (!count) return null;
  return <section className="card card-pad delivery-photos" aria-labelledby="delivery-photos-heading">
    <div className="section-head flush"><h2 id="delivery-photos-heading">Ảnh giao hàng</h2><span className="scope-chip">{count} ảnh</span></div>
    {!canView ? <p className="muted">Cần quyền xác minh giao hàng để xem ảnh.</p> : <PhotoSections set={set} headingLevel="h3" />}
  </section>;
}

/** FB11: the order page shows the photos of every delivery of the order, by delivery. */
export async function OrderDeliveryPhotos({ orderId, canView, canViewInternal }: { orderId: string; canView: boolean; canViewInternal: boolean }) {
  const supabase = await createServerSupabase();
  const { data: deliveries, error } = await supabase.from("deliveries").select("id, delivery_number, execution_state")
    .eq("sales_order_id", orderId).in("execution_state", ["DISPATCHED", "ARRIVED", "RESULT_SUBMITTED", "VERIFIED"]).order("created_at");
  if (error) return <section className="card card-pad"><h2>Ảnh giao hàng</h2><p role="alert">Chưa tải được ảnh. Tải lại trang.</p></section>;
  if (!deliveries?.length) return null;
  const sets = await Promise.all(deliveries.map(async (delivery) => ({ delivery, set: await loadDeliveryPhotos(supabase, delivery.id as string, canViewInternal) })));
  const shown = sets.filter(({ set }) => set.failed || set.loaded.length + set.delivered.length > 0);
  if (!shown.length) return null;
  const count = shown.reduce((sum, { set }) => sum + set.loaded.length + set.delivered.length, 0);
  return <section className="card card-pad delivery-photos" aria-labelledby="order-photos-heading">
    <div className="section-head flush"><h2 id="order-photos-heading">Ảnh giao hàng</h2><span className="scope-chip">{count} ảnh</span></div>
    {!canView ? <p className="muted">Cần quyền xác minh giao hàng để xem ảnh.</p> : shown.map(({ delivery, set }) => <div className="delivery-photos-group" key={delivery.id as string}>
      <h3><Link className="code-link mono" href={`/admin/deliveries/${delivery.id}`}>{delivery.delivery_number as string}</Link></h3>
      {set.failed ? <p role="alert">Chưa tải được ảnh của phiếu này.</p> : <PhotoSections set={set} headingLevel="h4" />}
    </div>)}
  </section>;
}
