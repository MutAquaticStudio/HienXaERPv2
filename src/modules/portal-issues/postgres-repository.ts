import "server-only";

import type { TransactionSql } from "postgres";

import { PlatformError } from "@/modules/platform/errors";
import type { Principal } from "@/modules/platform/types";
import type { PortalIssueCommandInput } from "@/modules/portal-issues/types";

export async function executePortalIssueCommand(
  sql: TransactionSql,
  principal: Principal,
  idempotencyKey: string,
  input: PortalIssueCommandInput,
) {
  const rows = await sql<{ id: string }[]>`
    select app_private.report_portal_issue(
      ${input.sourceType}, ${input.sourceId}, ${input.category},
      ${input.description}, ${idempotencyKey}, ${principal.userId}
    ) as id
  `;
  const id = rows[0]?.id;
  if (!id) {
    throw new PlatformError(
      "Chưa tạo được báo cáo sự cố. Hãy thử lại.",
      "PORTAL_ISSUE_CREATE_FAILED",
      503,
    );
  }
  return { id, kind: input.kind };
}
