import Link from "next/link";

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "commerce" }) {
  return <Link className={`button button-${variant}`} href={href}>{children}</Link>;
}
