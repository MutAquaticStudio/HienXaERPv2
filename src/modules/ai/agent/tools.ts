import "server-only";

// FB15 (D37): one chatbot tool per action of AGENT_ACTIONS the person may do. Calling it only prepares: the action is
// stored (create_ai_action) and shown as a card; the person presses "Xác nhận" to run it.
import { ZodError } from "zod";

import { AppError } from "@/lib/core/errors";
import type { AiTool } from "@/modules/ai/tools";
import { AGENT_ACTIONS, canUseAction, type AgentAction } from "./registry";
import { ResolveError } from "./resolve";

/** The model-facing text of a failed preparation: what to fix or ask, never a stack trace. */
export function prepareFailure(error: unknown): string {
  if (error instanceof ResolveError || error instanceof AppError) return `Lỗi: ${error.message}`;
  if (error instanceof ZodError) return `Lỗi: thông tin chưa hợp lệ — ${error.issues.map((issue) => `${issue.path.join(".") || "dữ liệu"}: ${issue.message}`).join("; ")}.`;
  return "Lỗi: chưa soạn được thao tác này. Hỏi lại người dùng hoặc dùng tao_de_xuat.";
}

function agentTool(action: AgentAction): AiTool {
  return {
    name: action.kind,
    define: (context) => canUseAction(action, context.permissions) ? {
      name: action.kind,
      description: `[${action.area}] ${action.description} Chỉ soạn sẵn; người dùng bấm Xác nhận trên thẻ mới thực hiện.`,
      strict: true,
      input_schema: { type: "object", additionalProperties: false, required: Object.keys(action.properties), properties: action.properties },
    } : null,
    async run(context, input) {
      if (!canUseAction(action, context.permissions)) return { text: "Lỗi: người dùng không có quyền làm việc này.", isError: true };
      try {
        const prepared = await action.prepare(context, input);
        const { data, error } = await context.supabase.rpc("create_ai_action", { target_branch_id: context.branchId, action_kind: action.kind,
          action_title: prepared.title, action_summary: prepared.summary, action_payload: prepared.payload });
        if (error || !data) {
          return { text: error?.message.includes("too_many_pending_ai_actions") ? "Lỗi: đang có quá nhiều thao tác chờ xác nhận; người dùng cần xác nhận hoặc bỏ qua bớt." : "Lỗi: chưa lưu được thao tác soạn sẵn.", isError: true };
        }
        const lines = prepared.summary.map((line) => `- ${line.label}: ${line.value}`).join("\n");
        return { text: `Đã soạn "${prepared.title}":\n${lines}\nChưa thực hiện: người dùng cần bấm Xác nhận trên thẻ bên dưới câu trả lời.`, isError: false, actionId: String(data) };
      } catch (error) {
        return { text: prepareFailure(error), isError: true };
      }
    },
  };
}

export const AGENT_TOOLS: readonly AiTool[] = AGENT_ACTIONS.map(agentTool);
