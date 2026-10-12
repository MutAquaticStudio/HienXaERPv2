import Link from "next/link";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { readOperationalState } from "@/modules/operations/server";
import { historicalScopeLabel, recordingScopeText } from "@/modules/operations/state";

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
 const access = await requireInternalPermission("roles.manage").catch((error: unknown) => {
  if (error instanceof AppError && error.code === "FORBIDDEN") return null;
  throw error;
 });
 if (!access) return <section className="card card-pad"><h1>Không có quyền truy cập</h1><p>Bạn cần quyền quản trị để xem trang này.</p><Link className="button button-secondary" href="/">Về trang chính</Link></section>;
 const state = await readOperationalState(access.branchId);
 const query = await searchParams;
 return <><header className="page-heading"><div><p className="eyebrow">{access.branchName}</p>
  <h1>Phạm vi dữ liệu</h1><p className="lede">Giao dịch mới và dữ liệu lịch sử được ghi nhận theo nguồn riêng.</p></div></header>
  {query.error && <p role="alert">Chưa thể xử lý hồ sơ lịch sử. Kiểm tra quyền, nguồn đối chiếu và phiên bản hệ thống.</p>}
  <section className="card card-pad"><h2>Giao dịch mới</h2>
   <p>Có thể thực hiện giao dịch mới hợp lệ mà không nhập số dư đầu kỳ hoặc kích hoạt thủ công.</p>
   <p>Mỗi thao tác vẫn kiểm tra quyền, phiên bản, lượng khả dụng, giới hạn nguồn và kết quả đã ghi để tránh ghi lặp.</p>
   <dl><dt>Mốc ghi nhận</dt><dd>{state?.recordedOperationsSince ? formatBusinessDateTime(state.recordedOperationsSince) : "Chưa có mốc ghi nhận"}</dd></dl>
  </section>
  <section className="card card-pad"><h2>Phạm vi lịch sử</h2>
   <p>{recordingScopeText(state?.historicalQuality)}</p>
   <dl><dt>Hồ sơ lịch sử</dt><dd>{historicalScopeLabel(state?.historicalQuality)}</dd>
    <dt>Đối chiếu phạm vi đã nhập</dt><dd>{state?.historicalQuality === "VERIFIED_IMPORT_SCOPE" ? "Đã có nguồn đối chiếu trong phạm vi hồ sơ" : "Chưa đối chiếu"}</dd></dl>
   <p>Thiếu lịch sử không có nghĩa số dư trước đây bằng 0. Việc nhập lịch sử, nếu cần, phải có nguồn và phê duyệt riêng; không phải điều kiện mở giao dịch mới.</p>
  </section>
 </>;
}
