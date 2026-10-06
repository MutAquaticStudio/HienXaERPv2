import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { createPortalEvidenceStorage } from "@/modules/portal/evidence-storage";
import { authenticatedPortalClient, PortalRpcError, portalRpc } from "@/modules/portal/server";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

type AuthorizedEvidence = {
  id: string;
  bucket_id: string;
  object_path: string;
  mime_type: string;
};

function failure(status: number) {
  return NextResponse.json({ error: "Không thể mở minh chứng." }, { status, headers: privateHeaders });
}

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await route.params;
    if (!z.uuid().safeParse(id).success) return failure(404);
    const auth = await authenticatedPortalClient();
    if (!auth) return failure(401);

    // STABLE applies to this RPC statement only, not across requests.
    // Identity and the authoritative object path come from the user's session/DB.
    const evidence = await portalRpc<AuthorizedEvidence>(
      auth.supabase, "get_portal_evidence_for_signing", { target_evidence_id: id },
    );
    if (evidence?.id !== id || evidence.bucket_id !== "portal-evidence" ||
        !evidence.object_path || !["image/png", "image/jpeg", "application/pdf"].includes(evidence.mime_type)) {
      return failure(404);
    }

    const { data, error } = await createPortalEvidenceStorage()
      .from(evidence.bucket_id).download(evidence.object_path);
    if (error || !data) return failure(503);

    return new NextResponse(data.stream(), {
      headers: {
        ...privateHeaders,
        "Content-Type": evidence.mime_type,
        "Content-Disposition": "inline",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return failure(error instanceof PortalRpcError && error.code === "42501" ? 404 : 503);
  }
}
