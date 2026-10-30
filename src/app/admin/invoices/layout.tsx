import type { ReactNode } from "react";
import { requireInternalAccess } from "@/lib/access/context";
import { E_INVOICES_ENABLED, E_INVOICES_PAUSED_MESSAGE } from "@/lib/features";

/** Owner decision D41: the invoice module is paused; every screen under Hóa đơn shows this notice instead. */
export default async function InvoicesLayout({ children }: { children: ReactNode }) {
  if (E_INVOICES_ENABLED) return children;
  await requireInternalAccess();
  return <div className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Tài chính</p><h1>Hóa đơn điện tử (tạm ngừng)</h1>
      <p className="lede">{E_INVOICES_PAUSED_MESSAGE}</p></div></header>
    <section className="card card-pad">
      <h2>Trong thời gian tạm ngừng</h2>
      <ul>
        <li>Không lập hồ sơ hóa đơn bán ra, không ghi hay đối chiếu chứng từ mua vào trên hệ thống.</li>
        <li>Bán hàng, công nợ, thu chi và Sổ quỹ vẫn hoạt động bình thường; phiếu thu / chi vẫn in được ở Sổ quỹ.</li>
        <li>Module sẽ mở lại sau khi hoàn tất nghiên cứu quy định mới về kê khai thuế và hóa đơn điện tử.</li>
      </ul>
    </section>
  </div>;
}
