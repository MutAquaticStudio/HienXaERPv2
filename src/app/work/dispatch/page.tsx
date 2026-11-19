import { redirect } from "next/navigation";

import { FieldDispatchBoardView } from "@/components/portal/field-dispatch-board";
import { requireInternalAccess } from "@/lib/access/context";
import { FIELD_DISPATCH_PERMISSION, type FieldDispatchBoard } from "@/modules/portal/field-dispatch";
import { loadFieldDispatchBoard } from "@/modules/portal/field-dispatch-server";
import { PortalRpcError } from "@/modules/portal/server";

/** D85 "Điều phối": only for a lead worker (work.field_dispatch at this branch); anyone else goes back to Hôm nay. */
export default async function WorkDispatchPage() {
  const access = await requireInternalAccess("/work/login");
  if (!access.permissions.has(FIELD_DISPATCH_PERMISSION)) redirect("/work");
  let board: FieldDispatchBoard | null = null;
  try {
    board = await loadFieldDispatchBoard(access.branchId);
  } catch (error) {
    if (!(error instanceof PortalRpcError && error.code === "42501")) throw error;
  }
  if (!board) redirect("/work");
  return <FieldDispatchBoardView board={board} />;
}
