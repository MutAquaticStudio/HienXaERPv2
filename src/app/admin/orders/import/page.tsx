import Link from "next/link";

import { BulkImportWizard } from "@/components/bulk-import/bulk-import-wizard";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function ImportSalesOrdersPage() {
  const access = await requireInternalPermission("orders.create");
  const supabase = await createServerSupabase();
  const { data: enabled, error } = await supabase.rpc("bulk_import_feature_status", { target_branch_id: access.branchId, target_kind: "SO" });
  if (!access.permissions.has("orders.read") || !enabled || error || process.env.HX_BULK_IMPORT_ENABLED !== "true") return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Bán hàng</p><h1>Nhập đơn bán từ Excel</h1></div></header>
    <section className="card card-pad" role="status"><h2>Tính năng chưa khả dụng</h2><p>Chức năng cần quyền tạo và đọc đơn bán, đồng thời phải được bật cho chi nhánh. Tạo đơn bán thủ công vẫn hoạt động bình thường.</p><Link className="button button-secondary" href="/admin/orders">Về danh sách đơn bán</Link></section></div>;
  return <div className="page-stack"><BulkImportWizard kind="SO" branchId={access.branchId} canManagePrice={access.permissions.has("pricing.manage")} /></div>;
}
