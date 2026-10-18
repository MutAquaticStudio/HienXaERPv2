import { AuthScreen } from "@/components/auth/auth-screen";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export default function WorkChangePasswordPage() {
  return <AuthScreen surface="work" title="Đổi mật khẩu" detail="Bạn đang dùng mật khẩu tạm do quản lý cấp. Chọn mật khẩu mới để bắt đầu làm việc." switchLink={null}>
    <ChangePasswordForm surface="work" />
  </AuthScreen>;
}
