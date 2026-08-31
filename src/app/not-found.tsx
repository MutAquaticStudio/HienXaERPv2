import Link from "next/link";

export default function NotFound() {
  return (
    <main className="centered-state">
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn này chưa tồn tại hoặc chưa được mở.</p>
      <Link className="primary-button button-link" href="/app">
        Về tổng quan
      </Link>
    </main>
  );
}
