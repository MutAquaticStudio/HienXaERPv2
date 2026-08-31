import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Tổng quan" };

const systemStates = [
  {
    title: "Hệ thống an toàn",
    detail: "Phân quyền đang được kiểm soát",
    icon: ShieldCheck,
  },
  {
    title: "Dữ liệu được bảo vệ",
    detail: "Bằng chứng được lưu riêng tư",
    icon: LockKeyhole,
  },
  {
    title: "Sẵn sàng vận hành",
    detail: "Nền tảng P1 đã được thiết lập",
    icon: CheckCircle2,
  },
] as const;

export default function OfficeHomePage() {
  return (
    <div className="office-home">
      <section className="welcome-block">
        <p className="page-context">Tổng quan hệ thống</p>
        <h1>Chào buổi sáng</h1>
        <p>
          HIỀN XA ERP đã có nền tảng bảo mật. Hãy bắt đầu cấu hình dữ liệu khi
          phase tiếp theo được phê duyệt.
        </p>
        <Link className="primary-button button-link" href="/app/settings">
          Kiểm tra thiết lập
        </Link>
      </section>
      <section className="system-section" aria-labelledby="system-status-title">
        <h2 id="system-status-title">Trạng thái hệ thống</h2>
        <div className="status-row">
          {systemStates.map(({ title, detail, icon: Icon }) => (
            <article className="status-item" key={title}>
              <span className="status-icon" aria-hidden="true">
                <Icon size={30} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
