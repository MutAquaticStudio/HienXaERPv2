import { AuthScreen } from "@/components/auth/auth-screen";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export default function CustomerChangePasswordPage() {
  return <AuthScreen surface="customer" title="Đổi mật khẩu" detail="Bạn đang dùng mật khẩu tạm do cửa hàng cấp. Chọn mật khẩu mới để tiếp tục." switchLink={null}>
    <ChangePasswordForm surface="customer" />
  </AuthScreen>;
}
