import { assertPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { PlatformError } from "@/modules/platform/errors";
import { getFinanceSnapshot } from "@/modules/finance/service";

export async function GET() {
  const principal = await getCurrentPrincipal("office");
  if (!principal) {
    return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  }

  try {
    assertPermission(principal, "finance.read");
    const snapshot = await getFinanceSnapshot(principal);
    return Response.json({ status: "READY", data: snapshot.summary });
  } catch (error) {
    const status = error instanceof PlatformError ? error.status : 403;
    return Response.json({ error: "ACCESS_DENIED" }, { status });
  }
}
