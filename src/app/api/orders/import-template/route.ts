import { NextResponse } from "next/server";

import { resolveInternalAccess } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildOrderTemplate } from "@/modules/sales/order-import";
import { loadTemplateReference } from "@/modules/sales/order-import-data";

/** FB15 (D37): the Excel template for "Nhập đơn bán từ Excel", with the branch's customers and goods to copy codes from. */
export async function GET() {
  let access: Awaited<ReturnType<typeof resolveInternalAccess>>;
  try { access = await resolveInternalAccess(); }
  catch (error) { return NextResponse.json({ error: "Không có quyền tải file mẫu." }, { status: error instanceof AppError ? error.status : 503 }); }
  if (!access.permissions.has("orders.create")) return NextResponse.json({ error: "Không có quyền tạo đơn bán." }, { status: 403 });
  try {
    const file = await buildOrderTemplate(await loadTemplateReference(await createServerSupabase(), access.branchId));
    return new NextResponse(new Uint8Array(file), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "cache-control": "private, no-store",
      "content-disposition": "attachment; filename=\"mau-nhap-don-ban.xlsx\"" } });
  } catch { return NextResponse.json({ error: "Không tạo được file mẫu." }, { status: 503 }); }
}
