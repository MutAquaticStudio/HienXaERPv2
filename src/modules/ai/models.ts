// D50: the Claude models a person may pick in the chat with the assistant (Owner 03/11/2026: Sonnet 5.5, Opus 5.5,
// Haiku 5.5; everyone chooses). Shared by the chat (the picker) and the server (validation, cost estimate).
// Prices are USD per million tokens at Anthropic list prices; the invoice is the Anthropic account's.

export type AiModelPrice = { input: number; output: number; cacheRead: number; cacheWrite: number };
export type AiModel = { id: string; label: string; hint: string; price: AiModelPrice; serverFallback: boolean };

export const AI_MODELS = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", hint: "Cân bằng, dùng hằng ngày",
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }, serverFallback: true },
  { id: "claude-opus-5-5", label: "Opus 5.5", hint: "Suy luận kỹ nhất, chậm hơn",
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }, serverFallback: true },
  // No server-side refusal fallback exists for Haiku: the request is sent without `fallbacks`.
  { id: "claude-haiku-5-5", label: "Haiku 5.5", hint: "Nhanh, rẻ; câu hỏi đơn giản",
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, serverFallback: false },
] as const satisfies readonly AiModel[];

export type AiModelId = (typeof AI_MODELS)[number]["id"];
export const DEFAULT_AI_MODEL: AiModelId = "claude-sonnet-5-5";
export const AI_MODEL_IDS = AI_MODELS.map((model) => model.id) as [AiModelId, ...AiModelId[]];

export function aiModel(id: string | null | undefined): (typeof AI_MODELS)[number] {
  return AI_MODELS.find((model) => model.id === id) ?? AI_MODELS[0];
}

// D50 (Owner 03/11/2026): how hard the model thinks before answering ("Mức suy nghĩ"), picked in the chat by everyone.
// Higher levels answer more carefully but take longer and use more tokens. "medium" is what the assistant used before.
export const AI_EFFORTS = [
  { id: "low", label: "Thấp", hint: "nhanh nhất" },
  { id: "medium", label: "Vừa", hint: "mặc định" },
  { id: "high", label: "Cao", hint: "kỹ hơn" },
  { id: "xhigh", label: "Rất cao", hint: "chậm, tốn hơn" },
  { id: "max", label: "Tối đa", hint: "chậm nhất, tốn nhất" },
] as const;

export type AiEffortId = (typeof AI_EFFORTS)[number]["id"];
export const DEFAULT_AI_EFFORT: AiEffortId = "medium";
export const AI_EFFORT_IDS = AI_EFFORTS.map((effort) => effort.id) as [AiEffortId, ...AiEffortId[]];

export function aiEffort(id: string | null | undefined): (typeof AI_EFFORTS)[number] {
  return AI_EFFORTS.find((effort) => effort.id === id) ?? AI_EFFORTS[1];
}
