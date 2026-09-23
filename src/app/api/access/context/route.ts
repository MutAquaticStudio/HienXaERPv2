import { AppError } from "@/lib/core/errors";
import { resolveInternalAccess } from "@/lib/access/context";
import { NextResponse } from "next/server";

export async function GET() {
  const startedAt = performance.now();
  try {
    const context = await resolveInternalAccess();
    const response = NextResponse.json({ employeeId: context.employeeId, branchId: context.branchId, roleId: context.roleId, permissions: [...context.permissions] });
    response.headers.set("cache-control", "private, no-store");
    if (process.env.HX_QA_RUNTIME_APPROVED === "true" && process.env.HX_QA_PROJECT_REF) {
      response.headers.set("server-timing", `access;dur=${(performance.now() - startedAt).toFixed(2)}`);
    }
    return response;
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json(error.toResponseBody(), { status: error.status });
    return NextResponse.json({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "Không thể kiểm tra quyền truy cập." } }, { status: 503 });
  }
}
