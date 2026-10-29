import "server-only";

// FB14 (D36): the chatbot's tools. Each tool says what it offers the asking person (or nothing, when they lack the
// permission) and how it runs under their own session; adding a capability is adding one entry to AI_TOOLS.
import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import type { createServerSupabase } from "@/lib/supabase/server";
import { sourcesFor } from "@/modules/ai/sources";

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;
export type AiToolContext = { supabase: Supabase; branchId: string; permissions: ReadonlySet<string> };
export type AiToolResult = { text: string; isError: boolean; proposal?: true };
export type AiTool = {
  name: string;
  /** The definition sent to Claude, or null when the person may not use the tool. */
  define(context: AiToolContext): Anthropic.Beta.BetaTool | null;
  run(context: AiToolContext, input: unknown): Promise<AiToolResult>;
};

/** Module name kept in the usage log and on proposals (the chatbot has no per-module scope any more). */
export const AI_SCOPE = "chatbot";
const MAX_RESULT_CHARS = 30_000;
const OPS = ["eq", "neq", "gte", "lte", "ilike", "is_null", "not_null"] as const;

const readSchema = z.object({
  source: z.string(),
  filters: z.array(z.object({ column: z.string().regex(/^[a-z_]{1,64}$/), op: z.enum(OPS), value: z.string().max(200) })).max(8),
  order_by: z.string(),
  descending: z.boolean(),
  limit: z.number().int().min(1).max(50),
});
const proposalSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(4000),
  link_path: z.string().regex(/^(\/admin(\/[A-Za-z0-9_./?=&%-]*)?)?$/),
});

/** Runs one `doc_du_lieu` call under the person's session; errors go back to the model as text. */
export async function readData(context: AiToolContext, raw: unknown): Promise<string> {
  const parsed = readSchema.safeParse(raw);
  if (!parsed.success) return "Lỗi: tham số đọc dữ liệu không hợp lệ.";
  const input = parsed.data;
  const source = sourcesFor(context.permissions).find((item) => item.name === input.source);
  if (!source) return "Lỗi: bạn không có quyền xem nguồn dữ liệu này.";
  let query = context.supabase.from(source.name).select(source.columns.join(","));
  if (!source.global) query = query.eq("branch_id", context.branchId);
  for (const filter of input.filters) {
    if (!source.columns.includes(filter.column)) return `Lỗi: cột ${filter.column} không có trong ${source.name}.`;
    if (filter.op === "is_null") query = query.is(filter.column, null);
    else if (filter.op === "not_null") query = query.not(filter.column, "is", null);
    else if (filter.op === "ilike") query = query.ilike(filter.column, filter.value);
    else if (filter.op === "eq") query = query.eq(filter.column, filter.value);
    else if (filter.op === "neq") query = query.neq(filter.column, filter.value);
    else if (filter.op === "gte") query = query.gte(filter.column, filter.value);
    else query = query.lte(filter.column, filter.value);
  }
  if (input.order_by) {
    if (!source.columns.includes(input.order_by)) return `Lỗi: không sắp xếp được theo ${input.order_by}.`;
    query = query.order(input.order_by, { ascending: !input.descending });
  }
  const { data, error } = await query.limit(input.limit);
  if (error) return "Lỗi khi đọc dữ liệu (có thể bạn không có quyền xem nguồn này hoặc giá trị lọc sai kiểu).";
  const text = JSON.stringify(data ?? []);
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}… (đã cắt bớt, hãy lọc hẹp hơn)` : text;
}

const readTool: AiTool = {
  name: "doc_du_lieu",
  define(context) {
    const sources = sourcesFor(context.permissions);
    if (!sources.length) return null;
    return {
      name: "doc_du_lieu",
      description: "Đọc dữ liệu của chi nhánh đang làm việc với quyền của người hỏi. Nguồn và cột được phép:\n"
        + sources.map((source) => `- ${source.name} (${source.label}): ${source.columns.join(", ")}`).join("\n")
        + "\nLọc theo cột (eq, neq, gte, lte, ilike với % cho tìm gần đúng, is_null, not_null; ngày giờ dạng ISO), sắp xếp theo một cột, tối đa 50 dòng mỗi lần. Đọc nhiều lần, nhiều nguồn nếu cần.",
      strict: true,
      input_schema: {
        type: "object",
        additionalProperties: false,
        required: ["source", "filters", "order_by", "descending", "limit"],
        properties: {
          source: { type: "string", enum: sources.map((source) => source.name) },
          filters: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["column", "op", "value"],
              properties: {
                column: { type: "string" },
                op: { type: "string", enum: [...OPS] },
                value: { type: "string", description: "Giá trị so sánh; để trống với is_null / not_null." },
              },
            },
          },
          order_by: { type: "string", description: "Cột sắp xếp; để trống nếu không cần." },
          descending: { type: "boolean" },
          limit: { type: "integer" },
        },
      },
    };
  },
  async run(context, input) {
    const text = await readData(context, input);
    return { text, isError: text.startsWith("Lỗi") };
  },
};

const proposalTool: AiTool = {
  name: "tao_de_xuat",
  define: () => ({
    name: "tao_de_xuat",
    description: "Ghi một đề xuất thay đổi sổ sách cho người quản lý duyệt (không tự thay đổi gì). Dùng khi người dùng muốn lập / sửa / thu / chi / điều chỉnh, hoặc khi bạn thấy việc cần làm.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "body", "link_path"],
      properties: {
        title: { type: "string", description: "Tiêu đề ngắn, ví dụ: Nhắc thu nợ Công ty An Phát" },
        body: { type: "string", description: "Việc cần làm, lý do và số liệu căn cứ." },
        link_path: { type: "string", description: "Đường dẫn màn hình thực hiện trong hệ thống, bắt đầu bằng /admin (ví dụ /admin/receivables); để trống nếu không rõ." },
      },
    },
  }),
  async run(context, raw) {
    const parsed = proposalSchema.safeParse(raw);
    if (!parsed.success) return { text: "Lỗi: đề xuất cần tiêu đề, nội dung và đường dẫn trong /admin (hoặc để trống).", isError: true };
    const { error } = await context.supabase.rpc("create_ai_proposal", {
      target_branch_id: context.branchId, ai_module: AI_SCOPE, proposal_title: parsed.data.title, proposal_body: parsed.data.body,
      proposal_link: parsed.data.link_path || null, operation_id: randomUUID(),
    });
    if (error) return { text: "Lỗi: chưa ghi được đề xuất.", isError: true };
    return { text: "Đã ghi đề xuất, đang chờ người quản lý duyệt.", isError: false, proposal: true };
  },
};

export const AI_TOOLS: readonly AiTool[] = [readTool, proposalTool];
