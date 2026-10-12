import { formatQuantity } from "@/lib/core/quantity";
import { formatBusinessDateTime } from "@/lib/core/business-time";
import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { createServerSupabase } from "@/lib/supabase/server";

type Revision = { id: string; quotation_id: string; revision_number: number; state: string; customer_name_snapshot: string; site_name_snapshot: string; delivery_address_snapshot: string; commercial_terms: string | null; total_vnd: string; expires_at: string | null };
type Line = { material_name_snapshot: string; quantity: string; unit_price_vnd: string; line_total_vnd: string; uom_symbol: string | null };
const money = (value: string) => `${new Intl.NumberFormat("vi-VN").format(BigInt(value))} VND`;
const stateLabel = (value: string) => ({ DRAFT: "Bản nháp", SENT: "Đã gửi", ACCEPTED: "Đã chấp nhận", SUPERSEDED: "Đã thay thế", CANCELLED: "Đã hủy" } as Record<string, string>)[value] ?? "Chưa xác định";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Cần đăng nhập.", { status: 401 });
  const { data: revisionData } = await supabase.from("quotation_revisions").select("id, quotation_id, revision_number, state, customer_name_snapshot, site_name_snapshot, delivery_address_snapshot, commercial_terms, total_vnd::text, expires_at").eq("id", id).maybeSingle();
  if (!revisionData) return new Response("Không tìm thấy phiên bản báo giá.", { status: 404 });
  const revision = revisionData as Revision;
  const [quoteResult, lineResult] = await Promise.all([
    supabase.from("quotations").select("quotation_number").eq("id", revision.quotation_id).maybeSingle(),
    supabase.rpc("customer_safe_quotation_lines", { target_revision_id: id }),
  ]);
  if (!quoteResult.data || lineResult.error) return new Response("Không thể tạo PDF.", { status: 404 });
  const lines = (lineResult.data ?? []) as unknown as Line[];
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const fontBytes = await readFile(path.join(process.cwd(), "public/fonts/NotoSansVietnamese-Regular.ttf"));
  const font = await document.embedFont(fontBytes);
  let page = document.addPage([595, 842]);
  let y = 790;
  const draw = (text: string, size = 10, x = 48) => {
    const maxWidth = 595 - x - 48;
    const lines: string[] = [];
    let current = "";
    for (const character of text) {
      if (character === "\n") { lines.push(current || " "); current = ""; continue; }
      if (current && font.widthOfTextAtSize(current + character, size) > maxWidth) {
        lines.push(current.trimEnd());
        current = character === " " ? "" : character;
      } else current += character;
    }
    if (current) lines.push(current);
    for (const line of lines) {
      if (y < 90) { page = document.addPage([595, 842]); y = 790; }
      page.drawText(line, { x, y, size, font, color: rgb(0.08, 0.15, 0.24) });
      y -= size + 9;
    }
  };
  draw("CÔNG TY TNHH HIỀN XA", 11);
  draw("BÁO GIÁ", 24);
  draw(`${quoteResult.data.quotation_number} · Phiên bản ${revision.revision_number} · ${stateLabel(revision.state)}`, 11);
  y -= 10;
  draw(`Khách hàng: ${revision.customer_name_snapshot}`, 11);
  draw(`Công trình: ${revision.site_name_snapshot}`, 11);
  draw(`Địa chỉ giao: ${revision.delivery_address_snapshot}`, 10);
  draw(`Hiệu lực đến: ${revision.expires_at ? formatBusinessDateTime(revision.expires_at) : "Không giới hạn"}`, 10);
  y -= 14;
  draw("VẬT TƯ / SỐ LƯỢNG / ĐƠN GIÁ / THÀNH TIỀN", 10);
  for (const line of lines) {
    if (y < 90) { page = document.addPage([595, 842]); y = 790; }
    draw(line.material_name_snapshot, 11);
    draw(`${formatQuantity(line.quantity)} ${line.uom_symbol ?? ""} · ${money(line.unit_price_vnd)} · ${money(line.line_total_vnd)}`, 9, 62);
  }
  y -= 12;
  draw(`TỔNG CỘNG: ${money(revision.total_vnd)}`, 14);
  if (revision.commercial_terms) { y -= 8; draw("ĐIỀU KHOẢN", 11); draw(revision.commercial_terms, 9); }
  const bytes = await document.save();
  return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${quoteResult.data.quotation_number}-R${revision.revision_number}.pdf"`, "Cache-Control": "private, no-store" } });
}
