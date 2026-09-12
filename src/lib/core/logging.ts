export type SafeLog = Readonly<{
  level: "info" | "warn" | "error";
  event: string;
  traceId: string;
  durationMs?: number;
  code?: string;
}>;

export function writeLog(entry: SafeLog): void {
  const sink = entry.level === "error" ? console.error : entry.level === "warn" ? console.warn : console.info;
  sink(JSON.stringify(entry));
}

export async function withTiming<T>(input: { event: string; traceId: string; run: () => Promise<T> }): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await input.run();
    writeLog({ level: "info", event: input.event, traceId: input.traceId, durationMs: Math.round(performance.now() - startedAt) });
    return result;
  } catch (error) {
    writeLog({
      level: "error",
      event: input.event,
      traceId: input.traceId,
      durationMs: Math.round(performance.now() - startedAt),
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
    throw error;
  }
}
