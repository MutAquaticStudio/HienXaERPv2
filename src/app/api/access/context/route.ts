import { AppError } from "@/lib/core/errors";
import { resolveInternalAccess } from "@/lib/access/context";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const context = await resolveInternalAccess();
    return NextResponse.json({ employeeId: context.employeeId, branchId: context.branchId, roleId: context.roleId, permissions: [...context.permissions] });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json(error.toResponseBody(), { status: error.status });
    return NextResponse.json({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "Không thể kiểm tra quyền truy cập." } }, { status: 503 });
  }
}
