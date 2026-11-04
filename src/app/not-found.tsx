import Link from "next/link";

/** The 404 page in Vietnamese (Next's default one is English), with a way back for staff, workers and customers. */
export default function NotFound() {
  return <main className="empty-state"><div>
    <h1>Không tìm thấy trang</h1>
    <p className="lede">Đường dẫn không đúng, hoặc chứng từ đã bị xóa hay chuyển sang chi nhánh khác.</p>
    <div className="inline-actions"><Link className="button button-primary" href="/">Về trang chính</Link></div>
  </div></main>;
}
