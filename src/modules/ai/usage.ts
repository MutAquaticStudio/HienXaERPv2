// FB12 (D34d): the month's estimated cost of the assistant in USD at Claude Sonnet 5.5 list prices (per million tokens:
// input 2, output 10, cache read 0,2, cache write 2,5). An estimate for the Owner; the invoice is the Anthropic account's.
export function aiUsageCostUsd(tokens: { input: number; output: number; cacheRead: number; cacheWrite: number }) {
  return (tokens.input * 2 + tokens.output * 10 + tokens.cacheRead * 0.2 + tokens.cacheWrite * 2.5) / 1_000_000;
}
