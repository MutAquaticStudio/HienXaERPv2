import type { Metadata } from "next";
import { AnnouncementComposer } from "@/components/announcements/announcement-composer";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { requireInternalPermission } from "@/lib/access/context";
import { loadComposerOptions, loadSentAnnouncements } from "@/modules/announcements/server";

export const metadata: Metadata = { title: "Soạn thông báo cập nhật · Thông báo" };

/** D83 (Owner: "owner nhé"): only the owner composes announcements for customers, workers and office staff. */
export default async function AnnouncementComposerPage() {
  const access = await requireInternalPermission("roles.manage");
  const [options, sent] = await Promise.all([loadComposerOptions(access.branchId), loadSentAnnouncements(access.branchId)]);
  const readAt = new Date().getTime();
  return <div className="page-stack">
    <Breadcrumb parent={{ href: "/admin/notifications", label: "Thông báo" }} current="Thông báo cập nhật" />
    <header className="page-heading"><div><h1>Soạn thông báo cập nhật</h1>
      <p className="lede">Hiện một lần cho từng người ở lần mở app tiếp theo, trên trang chủ, kèm thông báo đẩy về máy đã bật. Thông báo giá và đơn giá công được tạo tự động khi lưu; ở đây soạn các tin khác: tính năng mới, quy định, lịch nghỉ.</p></div></header>
    {options ? <AnnouncementComposer options={options} sent={sent} now={readAt} />
      : <p className="form-message" role="alert">Chưa tải được danh sách người nhận. Tải lại trang.</p>}
  </div>;
}
