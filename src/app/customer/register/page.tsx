import { AuthScreen } from "@/components/auth/auth-screen";
import { RegisterForm } from "@/components/auth/register-form";
import { portalRegistrationOpen } from "@/lib/auth/portal-registration";
import { createServerSupabase } from "@/lib/supabase/server";

/** D58: while the shop takes no self-registrations the page says so, instead of letting a login be made with no customer. */
export default async function CustomerRegisterPage() {
  const open = await portalRegistrationOpen(await createServerSupabase());
  return <AuthScreen surface="customer" title="Đăng ký tài khoản" detail="Tạo tài khoản để đặt hàng và theo dõi đơn, giao nhận, công nợ." switchLink={null}>
    {open ? <RegisterForm /> : <div className="auth-form auth-closed">
      <p role="status">Cửa hàng chưa mở tự đăng ký trên web. Gọi cửa hàng để được tạo tài khoản đăng nhập (bằng email hoặc số điện thoại).</p>
      <a className="button button-primary auth-submit" href="/customer/login">Về trang đăng nhập</a>
    </div>}
  </AuthScreen>;
}
