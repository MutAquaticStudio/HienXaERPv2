import { createClient } from "@/lib/supabase/server";
import {
  assertPermission,
  assertResourceAccess,
} from "@/modules/platform/authorization";
import { canUseSyntheticAuth } from "@/modules/platform/environment";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const principal = await getCurrentPrincipal("worker");
  if (!principal) {
    return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  try {
    assertPermission(principal, "work_item.read_assigned");
    const { id } = await params;

    if (canUseSyntheticAuth()) {
      const assignedUserId = id === "mine" ? principal.userId : "another-worker";
      assertResourceAccess(principal, { assignedUserId });
      return Response.json({ id, title: "Giao vật liệu", assignedUserId });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("work_items")
      .select("id, title, assigned_user_id")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    assertResourceAccess(principal, { assignedUserId: data.assigned_user_id });
    return Response.json(data);
  } catch (error) {
    const status = error instanceof PlatformError ? error.status : 403;
    return Response.json({ error: "ACCESS_DENIED" }, { status });
  }
}
