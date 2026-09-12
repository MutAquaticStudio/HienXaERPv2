import { StatusBadge } from "@/components/ui/status-badge";
import { requireInternalPermission } from "@/lib/access/context";
import { formatVnd, vnd } from "@/lib/core/money";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

type CustomerRow = { id: string; code: string; display_name: string; phone: string | null; tier_code: string | null; active: boolean; credit_limit_vnd?: string | number | null };

export default async function CustomersPage() {
  const access = await requireInternalPermission("customers.read");
  const canReadFinance = access.permissions.has("finance.ar.read");
  const supabase = await createServerSupabase();
  const fields = canReadFinance ? "id, code, display_name, phone, tier_code, active, credit_limit_vnd" : "id, code, display_name, phone, tier_code, active";
  const { data, error } = await supabase.from("customers").select(fields).eq("branch_id", access.branchId).order("display_name");
  if (error) throw new Error("Không thể tải danh sách khách hàng.");
  const customers = data as unknown as CustomerRow[];

  return <><header className="page-heading"><div><p className="eyebrow">Quan hệ khách hàng</p><h1>Khách hàng</h1><p className="lede">Hồ sơ và phạm vi tài chính được trả về đúng quyền tại {access.branchName}.</p></div></header><section className="card"><div className="section-head"><h2>{customers.length} khách hàng</h2></div><div className="table-wrap"><table><thead><tr><th>Mã</th><th>Tên khách hàng</th><th>Điện thoại</th><th>Nhóm giá</th>{canReadFinance && <th>Hạn mức</th>}<th>Trạng thái</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><Link className="mono" href={`/admin/customers/${customer.id}`}>{customer.code}</Link></td><td>{customer.display_name}</td><td>{customer.phone ?? "Chưa có"}</td><td>{customer.tier_code ?? "Mặc định"}</td>{canReadFinance && <td className="mono">{customer.credit_limit_vnd == null ? "Chưa duyệt" : formatVnd(vnd(customer.credit_limit_vnd.toString()))}</td>}<td><StatusBadge tone={customer.active ? "success" : "danger"}>{customer.active ? "Đang hoạt động" : "Ngừng giao dịch"}</StatusBadge></td></tr>)}</tbody></table></div></section></>;
}
