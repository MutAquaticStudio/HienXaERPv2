import { RecoveryForm } from "@/components/auth/recovery-form";

export default async function RecoveryPage({ searchParams }: PageProps<"/recovery">) {
  const params = await searchParams;
  const surface = params.surface === "work" || params.surface === "customer" ? params.surface : "admin";
  return <main className="auth-screen"><section className="auth-story"><span className="brand-mark">HX</span><p className="eyebrow">Khôi phục tài khoản</p><h1>Quay lại công việc an toàn.</h1><p>Hướng dẫn được gửi qua Supabase Auth. Thông báo không tiết lộ email nào đã đăng ký.</p></section><section className="auth-panel"><div className="auth-card"><p className="eyebrow">Xác minh tài khoản</p><h2>Đặt lại mật khẩu</h2><p className="muted">Nhập email bạn dùng để đăng nhập.</p><RecoveryForm surface={surface} /></div></section></main>;
}
