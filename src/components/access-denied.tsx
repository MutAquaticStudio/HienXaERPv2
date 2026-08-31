import { ShieldX } from "lucide-react";
import Link from "next/link";

export function AccessDenied() {
  return (
    <main className="centered-state">
      <ShieldX aria-hidden="true" size={54} />
      <h1>Không được phép truy cập</h1>
      <p>Bạn không có quyền xem nội dung này.</p>
      <Link className="primary-button button-link" href="/login">
        Quay lại đăng nhập
      </Link>
    </main>
  );
}
