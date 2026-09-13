import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <PortalShell audience="customer">{children}</PortalShell>;
}
