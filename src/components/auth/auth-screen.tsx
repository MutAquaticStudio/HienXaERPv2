import { LoginForm } from "./login-form";

const copy = {
  admin: { eyebrow: "Cổng điều hành", title: "Đăng nhập để tiếp tục", detail: "Dành cho chủ doanh nghiệp và nhân viên văn phòng.", switchHref: "/work/login", switchLabel: "Đi tới cổng tác nghiệp" },
  work: { eyebrow: "Cổng tác nghiệp", title: "Bắt đầu ca làm việc", detail: "Dành cho kho, tài xế và đội hiện trường.", switchHref: "/login", switchLabel: "Đi tới cổng điều hành" },
  customer: { eyebrow: "Cổng khách hàng", title: "Theo dõi giao dịch", detail: "Xem đúng đơn hàng và công nợ được cấp cho tài khoản này.", switchHref: "/login", switchLabel: "Đi tới cổng điều hành" },
} as const;

export function AuthScreen({ surface }: { surface: keyof typeof copy }) {
  const content = copy[surface];
  return <main className="auth-screen"><section className="auth-story"><span className="brand-mark">HX</span><p className="eyebrow">HIỀN XA ERP</p><h1>Một nguồn dữ liệu.<br />Ba không gian làm việc.</h1><p>Bán hàng, nguồn cung, giao nhận và công nợ được nối bằng định danh có kiểm quyền.</p></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">{content.eyebrow}</p><h2>{content.title}</h2><p className="muted">{content.detail}</p><LoginForm surface={surface} /><a className="auth-switch" href={content.switchHref}>{content.switchLabel}</a></div></section></main>;
}
