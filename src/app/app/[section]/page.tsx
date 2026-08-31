import { Construction, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/access-denied";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Khu vực làm việc" };

const sections: Record<string, { title: string; description: string }> = {
  sales: { title: "Bán hàng", description: "Được triển khai từ P3–P4." },
  sourcing: {
    title: "Mua & nguồn hàng",
    description: "Được triển khai trong P5.",
  },
  operations: {
    title: "Vận hành",
    description: "Được triển khai từ P6–P7.",
  },
  finance: { title: "Tài chính", description: "Được triển khai trong P8." },
  workforce: {
    title: "Nhân sự & sản lượng",
    description: "Được triển khai từ P10–P12.",
  },
  data: { title: "Dữ liệu", description: "Được mở rộng theo từng phase." },
  settings: {
    title: "Audit / Cài đặt",
    description: "Nền tảng audit và phân quyền đã sẵn sàng.",
  },
};

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const configuration = sections[section];
  if (!configuration) notFound();

  const principal = await getCurrentPrincipal("office");
  if (!principal) return <AccessDenied />;

  if (section === "finance" && !hasPermission(principal, "finance.read")) {
    return <AccessDenied />;
  }

  return (
    <section className="phase-locked-state">
      {section === "settings" ? (
        <ShieldAlert aria-hidden="true" size={52} />
      ) : (
        <Construction aria-hidden="true" size={52} />
      )}
      <h1>{configuration.title}</h1>
      <p>{configuration.description}</p>
      <strong>Phase tiếp theo vẫn đang khóa.</strong>
    </section>
  );
}
