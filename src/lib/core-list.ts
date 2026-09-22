export const CORE_LIST_PAGE_SIZE = 25;

export type CoreListQuery = {
  q?: string;
  state?: string;
  page?: string;
};

export function parseCoreListQuery(input: CoreListQuery) {
  const q = String(input.q ?? "").replace(/[,%()\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const state = /^[A-Z][A-Z0-9_]{1,39}$/.test(String(input.state ?? "")) ? String(input.state) : "";
  const requestedPage = Number.parseInt(String(input.page ?? "1"), 10);
  const page = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), 10000) : 1;
  const from = (page - 1) * CORE_LIST_PAGE_SIZE;
  return { q, state, page, from, to: from + CORE_LIST_PAGE_SIZE - 1 };
}

export function ilikePattern(q: string) {
  return `%${q}%`;
}
