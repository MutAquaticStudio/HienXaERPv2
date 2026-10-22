import { AuthScreen } from "@/components/auth/auth-screen";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export default async function CustomerChangePasswordPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // FB7: also opened from "Tài khoản" to change the password at any time, not only after a temporary one.
  const voluntary = (await searchParams).from === "account";
  return <AuthScreen surface="customer" title="Đổi mật khẩu" switchLink={voluntary ? { href: "/customer/profile", label: "← Về Tài khoản" } : null}
    detail={voluntary ? "Chọn mật khẩu mới cho tài khoản của bạn." : "Bạn đang dùng mật khẩu tạm do cửa hàng cấp. Chọn mật khẩu mới để tiếp tục."}>
    <ChangePasswordForm surface="customer" />
  </AuthScreen>;
}
