import { randomUUID } from "node:crypto";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ProfitabilityCommandCenter } from "@/components/profitability-command-center";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { getProfitabilitySnapshot } from "@/modules/profitability/service";

export const metadata: Metadata = { title: "Trung tâm điều hành lợi nhuận" };

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
    detail: "Tồn kho được suy ra từ sổ chuyển động bất biến",
    icon: CheckCircle2,
  },
] as const;

export default async function OfficeHomePage() {
  const principal = await getCurrentPrincipal("office");
  if (principal && hasPermission(principal, "margin.read")) {
    const data = await getProfitabilitySnapshot(principal);
    const keys = Object.fromEntries(
      data.orders.flatMap((order) => [
        [`cost:${order.id}`, randomUUID()],
        [`finalize:${order.id}`, randomUUID()],
        [`reopen:${order.id}`, randomUUID()],
      ]),
    );
    return (
      <ProfitabilityCommandCenter
        canManage={hasPermission(principal, "profitability.manage")}
        data={data}
        initialKeys={keys}
      />
    );
  }
  return (
    <div className="office-home">
      <section className="welcome-block">
        <p className="page-context">Tổng quan hệ thống</p>
        <h1>Chào buổi sáng</h1>
        <p>
          HIỀN XA ERP đã nối đơn bán với nguồn hàng, giữ tồn theo kho và ghi
          nhận nhập, xuất, kiểm kê bằng sổ chuyển động. Tồn thực tế, đã giữ và
          khả dụng luôn được suy ra thay vì sửa tay.
        </p>
        <Link className="primary-button button-link" href="/app/inventory">
          Mở kho & bãi
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
