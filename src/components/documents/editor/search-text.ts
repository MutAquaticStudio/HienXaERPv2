/** Lowercase, accent-free text so "xi mang" finds "Xi măng" and "da" finds "Đá". */
export function searchKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

/** Every typed word must appear in the code or the name, in any order. */
export function matchesSearch(query: string, ...fields: Array<string | null | undefined>): boolean {
  const words = searchKey(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = fields.map((field) => searchKey(field ?? "")).join(" ");
  return words.every((word) => haystack.includes(word));
}
