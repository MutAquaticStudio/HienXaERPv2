import { exportBusinessDocument } from "@/lib/pdf/document-export";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // D52: "?kho=k80" prints the order on an 80 mm receipt printer.
  return exportBusinessDocument("sales", (await params).id, new URL(request.url).searchParams.get("kho") === "k80" ? "K80" : "A4");
}
