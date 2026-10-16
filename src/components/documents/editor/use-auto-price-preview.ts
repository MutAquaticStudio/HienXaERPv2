"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const PRICE_PREVIEW_DELAY_MS = 250;

/**
 * Re-prices a document shortly after every valid change and discards answers to older requests.
 * `load` must be memoised on everything the price depends on. A preview belongs to `scope`
 * (e.g. the last save result): when scope changes the old preview is no longer shown.
 * With `holdUntilChange`, a stored draft is not repriced just by opening it.
 */
export function useAutoPricePreview<R>({ load, enabled, scope, failure, holdUntilChange = false, delayMs = PRICE_PREVIEW_DELAY_MS }: {
  load: () => Promise<R>; enabled: boolean; scope: unknown; failure: R; holdUntilChange?: boolean; delayMs?: number;
}) {
  const revision = useRef(0);
  const changed = useRef(!holdUntilChange);
  const [record, setRecord] = useState<{ scope: unknown; value: R } | null>(null);
  const [pending, setPending] = useState(false);
  const preview = record && Object.is(record.scope, scope) ? record.value : null;

  const invalidate = useCallback(() => {
    revision.current += 1;
    changed.current = true;
    setRecord(null);
    setPending(false);
  }, []);

  const refresh = useCallback(async () => {
    const current = ++revision.current;
    setPending(true);
    try {
      const value = await load();
      if (current === revision.current) setRecord({ scope, value });
    } catch {
      if (current === revision.current) setRecord({ scope, value: failure });
    } finally {
      if (current === revision.current) setPending(false);
    }
  }, [load, scope, failure]);

  useEffect(() => {
    if (!enabled || !changed.current) return;
    const timer = setTimeout(() => { void refresh(); }, delayMs);
    return () => { clearTimeout(timer); revision.current += 1; };
  }, [enabled, refresh, delayMs]);

  return { preview, pending, invalidate, refresh };
}
