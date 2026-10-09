import Link from "next/link";
import { readOperationalState } from "@/modules/operations/server";
import { operationalLabel } from "@/modules/operations/state";
export async function OperationalStateNotice({ branchId }: { branchId: string }) {
 const state = await readOperationalState(branchId);
 if (state?.state === "ACTIVE") return null;
 return <aside className="card card-pad" aria-label="Trạng thái vận hành">
  <strong>{operationalLabel(state?.state)}</strong>
  <p>Được nhập danh mục và lưu nháp theo quyền. Chưa được xác nhận hoặc ghi sổ tiền, công nợ, tồn kho.</p>
  <Link href="/admin/operations">Xem trạng thái chuẩn bị vận hành</Link>
 </aside>;
}
