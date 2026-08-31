import { LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { login } from "@/app/login/actions";

export const metadata: Metadata = { title: "Đăng nhập" };

const errorMessages: Record<string, string> = {
  missing_fields: "Hãy nhập đầy đủ tài khoản và mật khẩu.",
  invalid_credentials: "Tài khoản hoặc mật khẩu chưa đúng. Hãy kiểm tra lại.",
  invalid_link: "Liên kết đăng nhập không hợp lệ hoặc đã hết hạn.",
  configuration: "Hệ thống chưa được kết nối an toàn. Vui lòng báo quản trị viên.",
  inactive: "Tài khoản đã bị tạm ngưng hoặc vô hiệu hóa.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? errorMessages[error] : undefined;

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-heading">
        <Brand />
        <div>
          <h1 id="login-heading">Công việc rõ ràng. Dữ liệu an toàn.</h1>
          <p>
            Đăng nhập để xem đúng phần việc và thông tin bạn được phép sử dụng.
          </p>
        </div>
        <ul className="login-promises">
          <li>
            <ShieldCheck aria-hidden="true" />
            Chỉ người có quyền mới xem được dữ liệu
          </li>
          <li>
            <ShieldCheck aria-hidden="true" />
            Mọi thay đổi quan trọng đều được ghi nhận
          </li>
        </ul>
      </section>
      <section className="login-panel" aria-label="Biểu mẫu đăng nhập">
        <div className="login-card">
          <h2>Đăng nhập</h2>
          <p>Nhập tài khoản được quản trị viên cấp.</p>
          {message && (
            <div className="form-error" role="alert">
              <strong>Chưa đăng nhập được.</strong>
              <span>{message}</span>
            </div>
          )}
          <form action={login} className="login-form">
            <label htmlFor="identity">Số điện thoại hoặc email</label>
            <div className="input-wrap">
              <UserRound aria-hidden="true" size={22} />
              <input
                id="identity"
                name="identity"
                autoComplete="username"
                inputMode="email"
                required
              />
            </div>
            <label htmlFor="password">Mật khẩu</label>
            <div className="input-wrap">
              <LockKeyhole aria-hidden="true" size={22} />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <button className="primary-button worker-height" type="submit">
              ĐĂNG NHẬP
            </button>
          </form>
          <p className="login-help">
            Nếu quên mật khẩu, hãy liên hệ quản trị viên của công ty.
          </p>
        </div>
      </section>
    </main>
  );
}
