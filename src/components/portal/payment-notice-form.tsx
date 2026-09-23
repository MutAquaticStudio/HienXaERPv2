"use client";

import type { FormEvent } from "react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/portal/portal.module.css";

export function PaymentNoticeForm({ customerId }: { customerId: string }) {
  const operationId = useRef("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!operationId.current) operationId.current = crypto.randomUUID();
    setBusy(true);
    setError(false);
    setMessage("Đang tải chứng từ và gửi thông báo để đối soát...");
    const target = event.currentTarget;
    const form = new FormData(target);
    const file = form.get("file");
    try {
      if (!(file instanceof File) || file.size === 0) throw new Error("Cần chọn chứng từ thanh toán");
      const upload = new FormData();
      upload.set("file", file);
      upload.set("context", "PAYMENT_NOTICE");
      upload.set("customerId", customerId);
      upload.set("operationId", operationId.current);
      const uploadResponse = await fetch("/api/portal/evidence/upload", { method: "POST", body: upload });
      const uploadBody = await uploadResponse.json() as { evidenceId?: string; error?: string };
      if (!uploadResponse.ok || !uploadBody.evidenceId) throw new Error(uploadBody.error ?? "Tải chứng từ thất bại");

      const response = await fetch("/api/portal/payment-notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          evidenceId: uploadBody.evidenceId,
          amountVnd: form.get("amount_vnd"),
          paidOn: form.get("paid_on"),
          reference: form.get("reference"),
          note: form.get("note"),
          operationId: operationId.current,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Gửi thông báo thất bại");
      setMessage("Đã gửi thông báo. Công nợ chỉ thay đổi sau quy trình ghi nhận thanh toán riêng của nội bộ.");
      operationId.current = "";
      target.reset();
      router.refresh();
    } catch (submitError) {
      setError(true);
      setMessage(submitError instanceof TypeError || !navigator.onLine
        ? "Mất kết nối. Thông tin và chứng từ vẫn trên biểu mẫu; hãy kết nối lại rồi gửi lần nữa."
        : submitError instanceof Error ? submitError.message : "Gửi thông báo thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="notice-amount">Số tiền đã chuyển</label>
        <input id="notice-amount" inputMode="numeric" min="1" name="amount_vnd" required type="number" />
      </div>
      <div className={styles.field}>
        <label htmlFor="notice-date">Ngày chuyển</label>
        <input id="notice-date" name="paid_on" required type="date" />
      </div>
      <div className={styles.field}>
        <label htmlFor="notice-reference">Mã giao dịch</label>
        <input id="notice-reference" maxLength={120} minLength={3} name="reference" />
      </div>
      <div className={styles.field}>
        <label htmlFor="notice-file">Chứng từ</label>
        <input accept="image/jpeg,image/png,application/pdf" id="notice-file" name="file" required type="file" />
      </div>
      <div className={styles.field}>
        <label htmlFor="notice-note">Ghi chú</label>
        <textarea id="notice-note" maxLength={500} minLength={3} name="note" />
      </div>
      <p className={styles.hint}>Đây là thông báo đối soát, không phải phiếu thu và không tự giảm công nợ.</p>
      {message ? <p className={styles.status + " " + (error ? styles.error : "")} role="status">{message}</p> : null}
      <button className={styles.button} disabled={busy} type="submit">{busy ? "Đang gửi" : "Gửi thông báo thanh toán"}</button>
    </form>
  );
}
