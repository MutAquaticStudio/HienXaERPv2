import { randomUUID } from "node:crypto";
import { requireInternalAccess } from "@/lib/access/context";
import { readOperationalState } from "@/modules/operations/server";
import { operationalLabel, activationIntent } from "@/modules/operations/state";
import { activateOperations } from "./actions";
export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
 const access = await requireInternalAccess();
 const state = await readOperationalState(access.branchId);
 const query = await searchParams;
 return <><header className="page-heading"><div><p className="eyebrow">{access.branchName}</p>
  <h1>Chuẩn bị vận hành</h1><p className="lede">{operationalLabel(state?.state)}</p></div></header>
  {query.error && <p role="alert">Chưa thể kích hoạt. Kiểm tra quyền Owner, phiên bản, đối soát và recovery trước khi thử lại.</p>}
  {query.notice === "activated" && state?.state === "ACTIVE" && <p role="status">Đã kích hoạt vận hành có audit.</p>}
  <section className="card card-pad"><p>Nhập danh mục thật không đồng nghĩa số dư đầu kỳ đã được xác nhận.</p>
  <p>Importer đầu kỳ chỉ được ghi khi có package/hash, run, phạm vi, checkpoint đã kiểm chứng và FINAL OWNER IMPORT AUTHORIZATION riêng.</p>
  <p>Chưa đối soát độc lập thì chưa sẵn sàng kích hoạt. Không dùng số liệu UAT làm số dư thật.</p>
  <dl><dt>Trạng thái</dt><dd>{state?.state ?? "NOT_VERIFIED"}</dd><dt>Phiên bản</dt><dd>{state?.version ?? "NOT_VERIFIED"}</dd>
  <dt>Đối soát</dt><dd>{state?.reconciliationId ?? "Chưa có bằng chứng được chấp nhận"}</dd></dl></section>
  {state?.canActivate && state.version !== null && <section className="card card-pad"><h2>Kích hoạt bởi Owner</h2>
  <form action={activateOperations}><input type="hidden" name="version" value={state.version} /><input type="hidden" name="operationId" value={randomUUID()} />
  <label><input type="checkbox" name="recoveryAccepted" required />Tôi chấp nhận recovery và cho phép bắt đầu vận hành.</label>
  <p>Nhập chính xác: <code>{activationIntent(access.branchId, state.version)}</code></p>
  <label>Xác nhận kích hoạt<input name="confirmation" required autoComplete="off" /></label>
  <button className="button" type="submit">Kích hoạt vận hành</button></form></section>}
 </>;
}
