"use client";

// FB12: a form for one database command. It keeps one operation id per attempt (a retry after a lost answer replays, never
// records twice) and takes a new one after a success; inside a FormDialog a success closes the popup.
import { useActionState, useEffect, useState, type ReactNode } from "react";

import { useCloseFormDialog } from "@/components/ui/form-dialog";

export type CommandState = { success?: boolean; message?: string } | undefined;
export type CommandAction<S extends CommandState> = (state: S, form: FormData) => Promise<S>;

/** The form state, its submit and one operation id per attempt, renewed once the command succeeded. */
export function useCommand<S extends CommandState>(action: CommandAction<S>) {
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [state, run, pending] = useActionState<S, FormData>(async (previous, form) => {
    const outcome = await action(previous as S, form);
    if (outcome?.success) setOperationId(crypto.randomUUID());
    return outcome as Awaited<S>;
  }, undefined as Awaited<S>);
  return { state, run, pending, operationId };
}

export function CommandForm<S extends CommandState>({ action, submit, danger, children, onSaved, className = "command-panel" }: {
  action: CommandAction<S>; submit: string; danger?: boolean; children?: ReactNode; onSaved?: (state: S) => void; className?: string;
}) {
  const { state, run, pending, operationId } = useCommand(action);
  const dialogClose = useCloseFormDialog();
  useEffect(() => {
    if (!state?.success) return;
    if (onSaved) onSaved(state);
    else dialogClose?.();
  }, [state, onSaved, dialogClose]);
  return <form action={run} className={className}>
    <input type="hidden" name="operationId" value={operationId} />
    {children}
    {state?.message && <p className={`form-message${state.success ? " success" : ""}`} role="status">{state.message}</p>}
    <button className={`button ${danger ? "button-danger" : "button-primary"}`} disabled={pending}>{pending ? "Đang lưu…" : submit}</button>
  </form>;
}
