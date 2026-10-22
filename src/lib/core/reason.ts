/**
 * FB7 (Owner 22/10): no screen asks for a reason any more. The database still keeps one in its history (3–500 characters),
 * so a note the user wrote is kept when it is long enough, otherwise a plain description of the action is recorded.
 */
export function reasonOrDefault(text: unknown, fallback: string): string {
  const value = typeof text === "string" ? text.trim() : "";
  if (value.length >= 3) return value.slice(0, 500);
  return value ? `${fallback}: ${value}` : fallback;
}
