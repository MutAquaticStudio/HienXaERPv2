import { AuthFrame } from "@/components/auth/auth-frame";
import { RecoveryForm } from "@/components/auth/recovery-form";

export default async function RecoveryPage({ searchParams }: PageProps<"/recovery">) {
  const params = await searchParams;
  const surface = params.surface === "work" || params.surface === "customer" ? params.surface : "admin";
  return <AuthFrame><p className="eyebrow">Khôi phục tài khoản</p><h1>Đặt lại mật khẩu</h1><p className="muted">Nhập địa chỉ thư điện tử bạn dùng để đăng nhập; hướng dẫn đặt lại mật khẩu sẽ được gửi đến đó.</p><RecoveryForm surface={surface} /></AuthFrame>;
}
