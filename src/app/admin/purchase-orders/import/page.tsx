import Link from "next/link";

import { BulkImportWizard } from "@/components/bulk-import/bulk-import-wizard";
import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function ImportPurchaseOrdersPage() {
  const access = await requireInternalPermission("purchasing.create");
  const supabase = await createServerSupabase();
  const { data: enabled, error } = await supabase.rpc("bulk_import_feature_status", { target_branch_id: access.branchId, target_kind: "PO" });
  if (!access.permissions.has("purchasing.read") || !access.permissions.has("purchasing.price.read") || !enabled || error || process.env.HX_BULK_IMPORT_ENABLED !== "true") return <div className="page-stack"><header className="page-heading"><div><p className="eyebrow">Cung ứng</p><h1>Nhập đơn mua từ Excel</h1></div></header>
    <section className="card card-pad" role="status"><h2>Tính năng chưa khả dụng</h2><p>Chức năng cần quyền tạo, đọc và xem giá mua, đồng thời phải được bật cho chi nhánh. Tạo đơn mua thủ công vẫn hoạt động bình thường.</p><Link className="button button-secondary" href="/admin/purchase-orders">Về danh sách đơn mua</Link></section></div>;
  return <div className="page-stack"><BulkImportWizard kind="PO" branchId={access.branchId} canManagePrice={access.permissions.has("purchasing.price.manage")} /></div>;
}
