import { NextResponse } from "next/server";

import { authenticatedPortalClient, portalRpc } from "@/modules/portal/server";

type SignableEvidence = { bucket_id: string; object_path: string };

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const auth = await authenticatedPortalClient();
  if (!auth) return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn" }, { status: 401 });
  try {
    const { id } = await route.params;
    const evidence = await portalRpc<SignableEvidence>(
      auth.supabase,
      "get_portal_evidence_for_signing",
      { target_evidence_id: id },
    );
    const { data, error } = await auth.supabase.storage
      .from(evidence.bucket_id)
      .createSignedUrl(evidence.object_path, 60);
    if (error || !data.signedUrl) throw new Error(error?.message ?? "Không thể cấp liên kết chứng từ");
    const response = NextResponse.redirect(data.signedUrl);
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể mở chứng từ" }, { status: 403 });
  }
}
