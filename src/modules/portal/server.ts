import "server-only";

import { createHash } from "node:crypto";

import { createServerSupabase } from "@/lib/supabase/server";
import { operationalPostingError } from "@/lib/core/errors";

type SupabaseServerClient = Awaited<ReturnType<typeof createServerSupabase>>;
type RpcFailure = { code?: string; message: string };
type RpcResponse<T> = Promise<{ data: T | null; error: RpcFailure | null }>;

export class PortalRpcError extends Error {
  code?: string;
  readonly rawMessage: string;

  constructor(error: RpcFailure) {
    super(operationalPostingError(error.message) ?? error.message);
    this.name = "PortalRpcError";
    this.code = error.code;
    this.rawMessage = error.message;
  }
}

export async function authenticatedPortalClient() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

export async function portalRpc<T>(
  supabase: SupabaseServerClient,
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    values?: Record<string, unknown>,
  ) => RpcResponse<T>;
  const { data, error } = await rpc.call(supabase, name, args);
  if (error) throw new PortalRpcError(error);
  return data as T;
}

export function deterministicUuid(seed: string) {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return [
    value.slice(0, 8),
    value.slice(8, 12),
    value.slice(12, 16),
    value.slice(16, 20),
    value.slice(20),
  ].join("-");
}

export function detectEvidenceMime(bytes: Uint8Array) {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}
