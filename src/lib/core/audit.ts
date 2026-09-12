export type AuditActor = Readonly<{ id: string; type: "user" | "system" }>;

export type AuditEvent = Readonly<{
  occurredAt: string;
  actor: AuditActor;
  source: "admin" | "work" | "customer" | "job";
  action: string;
  entityType: string;
  entityId: string;
  traceId: string;
  changes?: readonly string[];
}>;

export function createAuditEvent(input: Omit<AuditEvent, "occurredAt"> & { occurredAt?: Date }): AuditEvent {
  return {
    ...input,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    changes: input.changes ? [...new Set(input.changes)].sort() : undefined,
  };
}
