import "server-only";

import type { JSONValue, Sql, TransactionSql } from "postgres";

import type {
  CommandRecord,
  CommandStore,
  CommandTransaction,
} from "@/modules/platform/server-command";

class PostgresCommandTransaction implements CommandTransaction {
  constructor(readonly sql: TransactionSql) {}

  async find<Result>(
    actorId: string,
    commandName: string,
    idempotencyKey: string,
  ): Promise<CommandRecord<Result> | null> {
    const [row] = await this.sql<
      { request_hash: string; response_payload: Result | null }[]
    >`
      select request_hash, response_payload
      from app_private.idempotency_keys
      where actor_user_id = ${actorId}
        and command_name = ${commandName}
        and idempotency_key = ${idempotencyKey}
        and completed_at is not null
      for update
    `;
    if (!row || row.response_payload === null) return null;
    return { requestHash: row.request_hash, result: row.response_payload };
  }

  async reserve(input: {
    actorId: string;
    commandName: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<void> {
    await this.sql`
      insert into app_private.idempotency_keys (
        actor_user_id,
        command_name,
        idempotency_key,
        request_hash
      ) values (
        ${input.actorId},
        ${input.commandName},
        ${input.idempotencyKey},
        ${input.requestHash}
      )
    `;
  }

  async complete<Result>(input: {
    actorId: string;
    commandName: string;
    idempotencyKey: string;
    result: Result;
  }): Promise<void> {
    await this.sql`
      update app_private.idempotency_keys
      set response_payload = ${this.sql.json(input.result as JSONValue)},
          completed_at = now()
      where actor_user_id = ${input.actorId}
        and command_name = ${input.commandName}
        and idempotency_key = ${input.idempotencyKey}
    `;
  }

  async appendAudit(input: {
    actorId: string;
    eventType: string;
    entityType: string;
    entityId?: string;
    idempotencyKey: string;
  }): Promise<void> {
    await this.sql`
      insert into public.audit_events (
        actor_user_id,
        event_type,
        entity_type,
        entity_id,
        idempotency_key,
        payload
      ) values (
        ${input.actorId},
        ${input.eventType},
        ${input.entityType},
        ${input.entityId ?? null},
        ${input.idempotencyKey},
        ${this.sql.json({ phase: "P2" })}
      )
    `;
  }
}

export class PostgresCommandStore implements CommandStore {
  constructor(private readonly sql: Sql) {}

  async transaction<Result>(
    work: (transaction: CommandTransaction) => Promise<Result>,
  ): Promise<Result> {
    const result = await this.sql.begin(async (transactionSql) =>
      work(new PostgresCommandTransaction(transactionSql)),
    );
    return result as Result;
  }
}

export function getTransactionSql(
  transaction: CommandTransaction,
): TransactionSql {
  if (!(transaction instanceof PostgresCommandTransaction)) {
    throw new Error("Giao dịch không dùng PostgreSQL Production.");
  }
  return transaction.sql;
}
