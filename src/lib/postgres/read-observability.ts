import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export const readContext = new AsyncLocalStorage<{ id: string; module: string }>();

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code).slice(0, 80);
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}

export async function observeRead<T>(name: string, work: () => PromiseLike<T>): Promise<T> {
  const context = readContext.getStore() ?? { id: randomUUID(), module: name };
  return readContext.run(context, async () => {
    const started = performance.now();
    const fields = { readId: context.id, module: context.module, operation: name };
    console.info(JSON.stringify({ event: "read.start", ...fields }));
    try {
      const result = await work();
      console.info(JSON.stringify({ event: "read.success", ...fields,
        durationMs: Math.round(performance.now() - started),
        ...(Array.isArray(result) ? { rows: result.length } : {}),
        ...(result instanceof Response ? { httpStatus: result.status } : {}),
      }));
      return result;
    } catch (error) {
      // Never log SQL parameters, raw database errors, user records, or credentials.
      console.error(JSON.stringify({ event: "read.error", ...fields,
        durationMs: Math.round(performance.now() - started), code: errorCode(error),
      }));
      throw error;
    }
  });
}
