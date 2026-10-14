import { exportBusinessDocument } from "@/lib/pdf/document-export";
export const runtime = "nodejs";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return exportBusinessDocument("sales", (await params).id);
}
