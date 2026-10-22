export type CommandOutcome =
  | { status: "SUCCESS"; message: string; resultId: string }
  /** `field`: name of the input the message is about, so the form can mark it and put the cursor there. */
  | { status: "FAILED" | "UNKNOWN"; message: string; field?: string };

/** SQL rejection is transactional. Transport, proxy and ambiguous errors are unknown. */
export function isAuthoritativeRejection(code: string | undefined): boolean {
  return Boolean(code && /^(?:(?:22|23|40|42|55|P0)[A-Z0-9]{3}|PT4[0-9]{2})$/.test(code));
}
