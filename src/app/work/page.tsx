import { ClipboardList, RefreshCw } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Việc của tôi" };

export default function WorkerHomePage() {
  return (
    <section aria-labelledby="worker-heading">
      <h1 id="worker-heading">Việc của tôi</h1>
      <div className="empty-work-card">
        <ClipboardList aria-hidden="true" size={66} />
        <h2>Chưa có việc được giao</h2>
        <p>Khi có việc mới, bạn sẽ thấy ngay tại đây.</p>
      </div>
      <button className="primary-button worker-cta" type="button">
        <RefreshCw aria-hidden="true" size={24} />
        TẢI LẠI
      </button>
      <p className="worker-feedback" aria-live="polite">
        Dữ liệu sẽ tự cập nhật khi có kết nối.
      </p>
    </section>
  );
}
