"use client";

// D71: "Tạo tài khoản hàng loạt" on the customers page. Preview of who gets a login (the customer's phone number) and who is
// skipped and why; then the logins are made 10 customers at a time with random temporary passwords, and the owner downloads
// the sheet (name, phone, password, ready Zalo text). The passwords live only in this popup's memory.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Dialog } from "@/components/ui/dialog";
import { toCsv } from "@/lib/core/csv";
import { createCustomerPortalAccountsBatchAction, type BulkPortalResult } from "@/lib/auth/actions";
import type { BulkPlan } from "@/lib/auth/bulk-portal";

const BATCH = 10;

/** "0912345678" → "0912 345 678": Excel keeps a number with spaces as text, so the leading 0 stays. */
export const spacedPhone = (phone: string) => phone.length === 10 ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;

export function loginMessage(origin: string, phone: string, password: string) {
  return `Tài khoản đặt hàng & theo dõi đơn: ${origin}/customer/login\nĐăng nhập: ${phone}\nMật khẩu tạm: ${password}\nLần đầu đăng nhập sẽ được yêu cầu đổi mật khẩu.`;
}

export function bulkAccountsCsv(results: BulkPortalResult[], origin: string) {
  const rows = results.filter((result) => result.status === "CREATED" && result.password).map((result) => ({
    code: result.code, name: result.name, phone: spacedPhone(result.phone), password: result.password ?? "",
    message: loginMessage(origin, result.phone, result.password ?? ""),
  }));
  return toCsv(rows, [["code", "Mã khách"], ["name", "Tên khách"], ["phone", "Số điện thoại (đăng nhập)"], ["password", "Mật khẩu tạm"], ["message", "Tin nhắn gửi Zalo"]]);
}

export function BulkPortalAccounts({ plan, origin }: { plan: BulkPlan; origin: string }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="button button-secondary" onClick={() => setOpen(true)}>Tạo tài khoản hàng loạt</button>
    {open && <BulkDialog plan={plan} origin={origin} onClose={() => setOpen(false)} />}
  </>;
}

function BulkDialog({ plan, origin, onClose }: { plan: BulkPlan; origin: string; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"preview" | "running" | "done">("preview");
  const [results, setResults] = useState<BulkPortalResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const created = results.filter((result) => result.status === "CREATED");
  const problems = results.filter((result) => result.status !== "CREATED");

  async function run() {
    if (running.current) return;
    running.current = true;
    setPhase("running");
    setError(null);
    const ids = plan.eligible.map((customer) => customer.id);
    for (let from = 0; from < ids.length; from += BATCH) {
      try {
        const outcome = await createCustomerPortalAccountsBatchAction(ids.slice(from, from + BATCH));
        if (outcome.message) { setError(outcome.message); break; }
        setResults((previous) => [...previous, ...outcome.results]);
      } catch {
        setError("Mất kết nối giữa chừng. Các tài khoản đã tạo ở trên vẫn dùng được; tải file rồi mở lại trang để tạo tiếp phần còn lại.");
        break;
      }
    }
    running.current = false;
    setPhase("done");
  }

  function download() {
    const blob = new Blob([bulkAccountsCsv(results, origin)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tai-khoan-khach-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function close() {
    if (phase === "running") return;
    if (results.length) router.refresh();
    onClose();
  }

  return <Dialog title="Tạo tài khoản hàng loạt" size="lg" onClose={close}
    description="Mỗi khách đăng nhập cổng khách bằng số điện thoại của mình, với mật khẩu tạm ngẫu nhiên; khách đổi mật khẩu ở lần đăng nhập đầu. Không gửi email.">
    {phase === "preview" && <div className="form-stack">
      <p><strong>{plan.eligible.length}</strong> khách sẽ có tài khoản · <strong>{plan.skipped.length}</strong> khách bỏ qua</p>
      {plan.skipped.length > 0 && <details><summary>Xem khách bỏ qua và lý do</summary>
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Khách</th><th>Lý do</th></tr></thead>
          <tbody>{plan.skipped.map((item) => <tr key={item.id}><td className="mono">{item.code}</td><td>{item.name}</td><td>{item.reason}</td></tr>)}</tbody></table></div></details>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={close}>Hủy</button>
        <button type="button" className="button button-primary" disabled={!plan.eligible.length} onClick={() => void run()}>Tạo {plan.eligible.length} tài khoản</button></div>
    </div>}
    {phase === "running" && <div className="form-stack" role="status">
      <p>Đang tạo… {results.length} / {plan.eligible.length} khách. Giữ cửa sổ này mở đến khi xong.</p>
      <progress value={results.length} max={plan.eligible.length} />
    </div>}
    {phase === "done" && <div className="form-stack">
      <p role="status"><strong>Đã tạo {created.length} tài khoản</strong>{problems.length ? ` · ${problems.length} khách chưa tạo được` : ""}.</p>
      {error && <p className="form-message" role="alert">{error}</p>}
      {created.length > 0 && <>
        <p className="form-message" role="note">File chứa mật khẩu tạm và chỉ có ở màn hình này. Tải về và lưu cẩn thận trước khi đóng.</p>
        <div className="form-actions"><button type="button" className="button button-primary" onClick={download}>Tải file Excel (CSV)</button></div></>}
      {problems.length > 0 && <details open><summary>Khách chưa tạo được</summary>
        <div className="table-wrap"><table><thead><tr><th>Mã</th><th>Khách</th><th>Lý do</th></tr></thead>
          <tbody>{problems.map((item) => <tr key={item.customerId}><td className="mono">{item.code}</td><td>{item.name}</td><td>{item.message}</td></tr>)}</tbody></table></div></details>}
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={close}>Đóng</button></div>
    </div>}
  </Dialog>;
}
