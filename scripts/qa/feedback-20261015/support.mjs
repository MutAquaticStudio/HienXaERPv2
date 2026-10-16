import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { guard, PRODUCTION_REF } from "../core.mjs";

export const DEFAULT_ORIGIN = "http://127.0.0.1:3112";

/** Reads `.env.qa.local` and refuses anything that is not the approved QA project (never Production). */
export async function loadQaEnv(path) {
  if (!path) throw new Error("Thiếu --env (đường dẫn .env.qa.local)");
  const env = parseEnv(await readFile(path, "utf8"));
  if (Object.values(env).some((value) => String(value).includes(PRODUCTION_REF))) throw new Error("File env chứa Production ref; dừng.");
  const qa = guard(env);
  if (!env.HX_QA_PASSWORD) throw new Error("Thiếu HX_QA_PASSWORD trong file env QA");
  return { env, qa };
}

/** Only a local app server may be driven; the server itself must be started with the QA env. */
export function assertLocalOrigin(origin) {
  const url = new URL(origin);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.protocol !== "http:") throw new Error("Chỉ chạy với app local trỏ vào QA project (http://127.0.0.1:PORT)");
  return url.origin;
}

export function parseArgs(argv) {
  const out = { cases: [], writes: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === "--writes") out.writes = true;
    else if (key.startsWith("--")) {
      const value = argv[++i];
      if (value === undefined || value.startsWith("--")) throw new Error(`Thiếu giá trị cho ${key}`);
      out[key.slice(2)] = value;
    } else throw new Error(`Tham số không hợp lệ: ${key}`);
  }
  out.cases = (out.cases.length ? out.cases : String(out.only ?? "").split(",")).map((item) => item.trim().toUpperCase()).filter(Boolean);
  return out;
}

/** "1.234.567 ₫" → 1234567n, "-50 ₫" → -50n; "—", "Chưa đủ dữ liệu" and other non-amounts → null. */
export function parseVnd(text) {
  const value = String(text ?? "").replace(/\s|₫|đ/g, "");
  if (!/^[+\-−]?\d{1,3}(\.\d{3})*$/.test(value)) return null;
  return BigInt(value.replace(/^[+]/, "").replace("−", "-").replaceAll(".", ""));
}

/** Sum of exact amounts; null when any cell is not an amount (a gap must not count as 0). */
export function sumVnd(texts) {
  let total = 0n;
  for (const text of texts) {
    const value = parseVnd(text);
    if (value === null) return null;
    total += value;
  }
  return total;
}

/** Number of calendar days in [from, to) for YYYY-MM-DD dates. */
export function daySpan(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}
