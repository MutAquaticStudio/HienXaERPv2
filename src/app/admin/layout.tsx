import { AppShell } from "@/components/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell surface="admin">{children}</AppShell>;
}
