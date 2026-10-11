import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

// Call only after the current session passes the canonical evidence RPC.
// This client is never used to decide business authorization.
function createEvidenceServerClient() {
  const { url } = getSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Private evidence storage is not configured");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init = {}) => fetch(input, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.any([
          ...(init.signal ? [init.signal] : []),
          AbortSignal.timeout(15000),
        ]),
      }),
    },
  });
}

export function createPortalEvidenceStorage() {
  return createEvidenceServerClient().storage;
}

// The actor comes from auth.getUser() on the authenticated request, never its body.
// Call only after downloading the stored object and verifying its actual bytes.
export async function finalizeVerifiedEvidence(kind: "PORTAL" | "INTERNAL", input: {
  actorUuid: string; evidenceId: string; checksum: string; byteSize: number; operationId: string;
}) {
  const client = createEvidenceServerClient();
  const { data, error } = await client.rpc(kind === "PORTAL" ? "finalize_portal_evidence_verified" : "finalize_evidence_upload_verified", {
    actor_uuid: input.actorUuid, target_evidence_id: input.evidenceId, operation_id: input.operationId,
    ...(kind === "PORTAL" ? { target_checksum_sha256: input.checksum, target_byte_size: input.byteSize }
      : { checksum_sha256: input.checksum, byte_size: input.byteSize }),
  });
  if (error) throw new Error("Không thể xác minh tệp đã lưu.");
  return data;
}
