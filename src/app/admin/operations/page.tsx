import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireInternalPermission } from "@/lib/access/context";
import { AppError } from "@/lib/core/errors";
import { readOperationalState } from "@/modules/operations/server";
import { operationalLabel, operationalNextStep, activationIntent } from "@/modules/operations/state";
import { activateOperations } from "./actions";
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
 const access = await requireInternalPermission("roles.manage").catch((error: unknown) => {
  if (error instanceof AppError && error.code === "FORBIDDEN") return null;
  throw error;
 });
 if (!access) return <section className="card card-pad"><h1>Không có quyền truy cập</h1><p>Bạn cần quyền quản trị để xem trang này.</p><Link className="button button-secondary" href="/">Về trang chính</Link></section>;
 const state = await readOperationalState(access.branchId);
 const query = await searchParams;
 return <><header className="page-heading"><div><p className="eyebrow">{access.branchName}</p>
  <h1>Chuẩn bị vận hành</h1><p className="lede">{operationalLabel(state?.state)}</p></div></header>
  {query.error && <p role="alert">{query.error === "validation" ? "Thông tin kích hoạt chưa hợp lệ. Tải lại trang và kiểm tra mã xác nhận." : "Chưa thể kích hoạt. Chủ doanh nghiệp cần kiểm tra quyền, hồ sơ đối chiếu và phương án khôi phục, rồi tải lại trang."}</p>}
  {query.notice === "activated" && state?.state === "ACTIVE" && <p role="status">Đã kích hoạt vận hành và ghi nhận vào nhật ký hệ thống.</p>}
  <section className="card card-pad"><h2>Trạng thái vận hành</h2><p>{operationalNextStep(state?.state)}</p>
  <dl><dt>Trạng thái</dt><dd>{operationalLabel(state?.state)}</dd><dt>Lần cập nhật</dt><dd>{state?.version ?? "Chưa xác minh"}</dd>
  <dt>Đối chiếu số dư đầu kỳ</dt><dd>{state?.reconciliationId ? "Đã có hồ sơ đối chiếu được chấp nhận" : "Chưa có hồ sơ đối chiếu được chấp nhận"}</dd></dl></section>
  <section className="card card-pad"><h2>Hướng dẫn chuẩn bị</h2><p>Danh mục cơ bản được quản lý tại phân hệ tương ứng. Việc nhập danh mục không thay thế xác nhận số dư đầu kỳ.</p>
  <p>Số dư đầu kỳ chỉ được nhập từ bộ dữ liệu đã kiểm tra và được chủ doanh nghiệp phê duyệt riêng. Hồ sơ phải đầy đủ phạm vi nhập, dấu kiểm chứng dữ liệu và phương án khôi phục đã xác nhận.</p>
  <p>Cần đối chiếu độc lập số dư đầu kỳ trước khi kích hoạt. Không dùng số liệu kiểm thử làm số dư thực tế.</p></section>
  {state?.canActivate && state.version !== null && <section className="card card-pad"><h2>Kích hoạt bởi chủ doanh nghiệp</h2>
  <form action={activateOperations}><input type="hidden" name="version" value={state.version} /><input type="hidden" name="operationId" value={randomUUID()} />
  <label><input type="checkbox" name="recoveryAccepted" required />Tôi chấp nhận phương án khôi phục và cho phép bắt đầu vận hành.</label>
  <p>Mã xác nhận — nhập chính xác: <code>{activationIntent(access.branchId, state.version)}</code></p>
  <div className="field"><label htmlFor="activation-confirmation">Xác nhận kích hoạt</label><input id="activation-confirmation" name="confirmation" required autoComplete="off" /></div>
  <button className="button button-primary" type="submit">Kích hoạt vận hành</button></form></section>}
 </>;
}
