"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="empty-state"><div><h1>Không thể mở trang</h1><p className="lede">Tài khoản có thể không có quyền truy cập, hoặc hệ thống đang gặp sự cố. Kiểm tra quyền với quản trị viên nếu lỗi tiếp diễn.</p><button className="button button-primary" type="button" onClick={reset}>Thử lại</button></div></div>;
}
