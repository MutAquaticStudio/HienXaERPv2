import { AuthScreen } from "@/components/auth/auth-screen";

export default async function CustomerLoginPage({ searchParams }: PageProps<"/customer/login">) {
  const query = (await searchParams) as { confirmed?: string };
  return <AuthScreen surface="customer" notice={query.confirmed ? "Email đã được xác nhận. Đăng nhập để bắt đầu đặt hàng." : undefined} />;
}
