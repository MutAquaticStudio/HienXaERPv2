import { observeRead } from "@/lib/postgres/read-observability";

export async function boundedSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const target = input instanceof Request ? input.url : String(input);
  // Only the path is logged, never query filters, tokens, or request bodies.
  const operation = `supabase:${new URL(target).pathname}`;
  return observeRead(operation, async () => {
    const controller = new AbortController();
    const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = inherited ? AbortSignal.any([inherited, controller.signal]) : controller.signal;
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(input, { ...init, signal });
      // Keep the deadline active through body consumption, not only headers.
      const body = await response.arrayBuffer();
      return new Response([101, 204, 205, 304].includes(response.status) ? null : body, {
        status: response.status, statusText: response.statusText, headers: response.headers,
      });
    } finally {
      clearTimeout(timer);
    }
  });
}
