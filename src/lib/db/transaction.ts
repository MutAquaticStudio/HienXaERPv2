import "server-only";

import type { Sql } from "postgres";
import { getDatabase } from "./client";

export async function inTransaction<T>(work: (transaction: Sql) => Promise<T>): Promise<T> {
  const result = await getDatabase().begin(async (transaction) => work(transaction as unknown as Sql));
  return result as T;
}
