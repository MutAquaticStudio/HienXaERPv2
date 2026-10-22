import Link from "next/link";

/**
 * FB7 (Owner 22/10): the home page asks who is signing in — the operations side, a worker or a customer — and the customer
 * can also open an account from here.
 */
export function PortalChooser() {
  return <main className="auth-screen portal-chooser">
    <section className="auth-story"><span className="brand-mark">HX</span><p className="eyebrow">HIỀN XA ERP</p>
      <h1>Một nguồn dữ liệu.<br />Ba không gian làm việc.</h1>
      <p>Chọn đúng cổng để đăng nhập. Mỗi người chỉ thấy phần việc của mình.</p></section>
    <section className="auth-panel">
      <div className="portal-chooser-list">
        <h2>Bạn đăng nhập với vai trò nào?</h2>
        <Link className="portal-choice" href="/login">
          <span className="portal-choice-mark" aria-hidden="true">01</span>
          <span><strong>Khối vận hành</strong><small>Chủ doanh nghiệp, văn phòng, kho, điều phối: bán hàng, mua hàng, giao nhận, công nợ.</small></span>
          <span className="portal-choice-go" aria-hidden="true">→</span>
        </Link>
        <Link className="portal-choice" href="/work/login">
          <span className="portal-choice-mark" aria-hidden="true">02</span>
          <span><strong>Thợ &amp; tài xế</strong><small>Xem việc hôm nay, lấy hàng lên xe, báo đã giao kèm ảnh.</small></span>
          <span className="portal-choice-go" aria-hidden="true">→</span>
        </Link>
        <div className="portal-choice portal-choice-customer">
          <span className="portal-choice-mark" aria-hidden="true">03</span>
          <span><strong>Khách hàng</strong><small>Đặt hàng, theo dõi giao nhận và công nợ của bạn.</small></span>
          <span className="portal-choice-actions">
            <Link className="button button-primary" href="/customer/login">Đăng nhập</Link>
            <Link className="button button-secondary" href="/customer/register">Đăng ký</Link>
          </span>
        </div>
      </div>
    </section>
  </main>;
}
