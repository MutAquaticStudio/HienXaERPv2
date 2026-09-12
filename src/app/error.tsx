"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="empty-state"><div><p className="eyebrow">Không thể hoàn tất</p><h1>Đã có lỗi xảy ra</h1><p className="lede">Dữ liệu của bạn chưa bị thay đổi. Hãy thử tải lại thao tác.</p><button className="button button-primary" type="button" onClick={reset}>Thử lại</button></div></div>;
}
