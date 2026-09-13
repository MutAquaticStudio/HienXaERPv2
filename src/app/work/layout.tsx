import type { ReactNode } from "react";

import { PortalShell } from "@/components/portal/portal-shell";

export default function WorkLayout({ children }: { children: ReactNode }) {
  return <PortalShell audience="worker">{children}</PortalShell>;
}
