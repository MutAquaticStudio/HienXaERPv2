import { BadgeCheck, BriefcaseBusiness, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Hồ sơ công việc" };

export default async function WorkerProfilePage() {
  const principal = await getCurrentPrincipal("worker");
  if (!principal) return <AccessDenied />;
  return (
    <section className="worker-profile" aria-labelledby="worker-profile-heading">
      <header><p className="page-context">Hồ sơ vận hành</p><h1 id="worker-profile-heading">Tôi</h1><UserRound aria-hidden="true" /></header>
      <article><strong>{principal.displayName}</strong><span>Tài khoản đang hoạt động</span></article>
      <dl>
        <div><dt><BriefcaseBusiness />Vai trò</dt><dd>{principal.roles.join(", ")}</dd></div>
        <div><dt><BadgeCheck />Quyền nhận việc</dt><dd>{principal.permissions.includes("work_item.claim") ? "Đã bật" : "Chưa bật"}</dd></div>
        <div><dt><ShieldCheck />Phạm vi dữ liệu</dt><dd>{principal.scopes.map((scope) => scope.kind).join(", ")}</dd></div>
      </dl>
      <p>Vai trò và kỹ năng quyết định công việc bạn nhìn thấy trong bể. Liên hệ giám sát nếu thông tin chưa đúng.</p>
    </section>
  );
}
