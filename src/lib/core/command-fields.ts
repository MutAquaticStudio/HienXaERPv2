/** FormData transports may group repeated names; each field's value order is still binding. */
export function sameCommandFields(left: readonly (readonly [string, string])[], right: readonly (readonly [string, string])[]) {
  function grouped(entries: readonly (readonly [string, string])[]) {
    const fields = new Map<string, string[]>();
    for (const [name, value] of entries) fields.set(name, [...(fields.get(name) ?? []), value]);
    return [...fields].sort(([a], [b]) => a.localeCompare(b));
  }
  return JSON.stringify(grouped(left)) === JSON.stringify(grouped(right));
}
