// FB12 (D34d) → D50: the estimated cost of the assistant in USD at the list price of the model each call used (an
// unknown model is priced as Sonnet 5.5). An estimate for the Owner; the invoice is the Anthropic account's.
import { aiModel } from "@/modules/ai/models";

export type AiTokens = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function aiUsageCostUsd(tokens: AiTokens, model?: string | null) {
  const price = aiModel(model).price;
  return (tokens.input * price.input + tokens.output * price.output + tokens.cacheRead * price.cacheRead + tokens.cacheWrite * price.cacheWrite) / 1_000_000;
}
