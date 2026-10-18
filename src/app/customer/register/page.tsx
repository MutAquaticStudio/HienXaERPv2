import { AuthScreen } from "@/components/auth/auth-screen";
import { RegisterForm } from "@/components/auth/register-form";

export default function CustomerRegisterPage() {
  return <AuthScreen surface="customer" title="Đăng ký tài khoản" detail="Tạo tài khoản để đặt hàng và theo dõi đơn, giao nhận, công nợ." switchLink={null}>
    <RegisterForm />
  </AuthScreen>;
}
