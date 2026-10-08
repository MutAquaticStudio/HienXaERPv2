import { Suspense, type ReactNode } from "react";
import { WorkProofGallery } from "@/components/portal/work-proof-gallery";

export default async function WorkJobLayout({ children, params }: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <>{children}<Suspense fallback={null}><WorkProofGallery workItemId={id} /></Suspense></>;
}
