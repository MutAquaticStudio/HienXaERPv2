import { authenticatedPortalClient } from "@/modules/portal/server";
import styles from "@/components/portal/portal.module.css";

type WorkProof = {
  id: string;
  work_item_id: string | null;
  context_type: string;
  object_state: string;
  mime_type: string;
  final_byte_size: number | string | null;
};

export async function WorkProofGallery({ workItemId }: { workItemId: string }) {
  const context = await authenticatedPortalClient();
  if (!context) return null;
  // Ordinary session + existing evidence RLS; never query Storage or sign a bearer URL.
  const { data, error } = await context.supabase.from("portal_evidence_objects")
    .select("id,work_item_id,context_type,object_state,mime_type,final_byte_size")
    .eq("work_item_id", workItemId).eq("context_type", "WORK_RESULT")
    .eq("object_state", "READY").order("created_at", { ascending: true });
  if (error) throw new Error("work_proof_metadata_read_failed");
  const proofs = (data as WorkProof[] | null ?? []).filter((proof) => (
    proof.work_item_id === workItemId && proof.context_type === "WORK_RESULT"
    && proof.object_state === "READY" && /^[0-9a-f-]{36}$/i.test(proof.id)
  ));
  if (!proofs.length) return null;
  return (
    <section className={styles.card} aria-labelledby="work-proof-heading">
      <h2 id="work-proof-heading">{"B\u1eb1ng ch\u1ee9ng c\u1ee7a c\u00f4ng vi\u1ec7c"}</h2>
      <p className={styles.hint}>{"Mỗi lần mở tệp đều kiểm tra quyền truy cập hiện tại. Minh chứng được lưu riêng tư."}</p>
      <ul>{proofs.map((proof) => (
        <li key={proof.id}>
          <p>{proof.id} {" \u00b7 "}{proof.mime_type === "application/pdf" ? "Tài liệu PDF" : "Ảnh minh chứng"} {" \u00b7 "}{proof.final_byte_size == null ? "" : Number(proof.final_byte_size).toLocaleString("vi-VN")} byte</p>
          <a href={`/api/evidence/${proof.id}/signed`}>{"M\u1edf b\u1eb1ng ch\u1ee9ng"}</a>
        </li>
      ))}</ul>
    </section>
  );
}
