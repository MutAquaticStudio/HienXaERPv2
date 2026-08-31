import { UnsafeRuntimeError } from "@/modules/platform/errors";

export type AppEnvironment = "local" | "test" | "production";

export interface RuntimeEnvironment {
  appEnv?: string;
  vercelEnv?: string;
  supabaseUrl?: string;
  supabaseSecretKey?: string;
  supabaseDbUrl?: string;
  allowLiveDbWrites?: string;
  allowLocalSyntheticAuth?: string;
}

export function readRuntimeEnvironment(): RuntimeEnvironment {
  return {
    appEnv: process.env.APP_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    supabaseDbUrl: process.env.SUPABASE_DB_URL,
    allowLiveDbWrites: process.env.ALLOW_LIVE_DB_WRITES,
    allowLocalSyntheticAuth: process.env.ALLOW_LOCAL_SYNTHETIC_AUTH,
  };
}

export function isHostedSupabaseUrl(value?: string): boolean {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function isProductionRuntime(env: RuntimeEnvironment): boolean {
  return env.appEnv === "production" && env.vercelEnv === "production";
}

export function assertSafeRuntimeConfiguration(
  env: RuntimeEnvironment = readRuntimeEnvironment(),
): void {
  const production = isProductionRuntime(env);
  const hosted = isHostedSupabaseUrl(env.supabaseUrl);
  const hasPrivilegedSecret = Boolean(
    env.supabaseSecretKey || env.supabaseDbUrl,
  );

  if (!production && hasPrivilegedSecret) {
    throw new UnsafeRuntimeError(
      "Thông tin truy cập Supabase đặc quyền không được phép ngoài Production.",
    );
  }

  if (!production && hosted) {
    throw new UnsafeRuntimeError(
      "Môi trường ngoài Production không được kết nối Supabase hosted.",
    );
  }

  if (production && env.allowLocalSyntheticAuth === "true") {
    throw new UnsafeRuntimeError(
      "Không được bật đăng nhập giả lập trong Production.",
    );
  }
}

export function assertLiveWriteAllowed(
  env: RuntimeEnvironment = readRuntimeEnvironment(),
): void {
  assertSafeRuntimeConfiguration(env);

  if (!isHostedSupabaseUrl(env.supabaseUrl)) return;

  if (!isProductionRuntime(env) || env.allowLiveDbWrites !== "true") {
    throw new UnsafeRuntimeError(
      "Ghi dữ liệu live bị chặn: cần Vercel Production và ALLOW_LIVE_DB_WRITES=true.",
    );
  }
}

export function canUseSyntheticAuth(
  env: RuntimeEnvironment = readRuntimeEnvironment(),
): boolean {
  assertSafeRuntimeConfiguration(env);
  return (
    (env.appEnv === "local" || env.appEnv === "test") &&
    env.allowLocalSyntheticAuth === "true"
  );
}
