type Intent = { create: string; finalize: string };
type IntentStorage = Pick<Storage, "getItem" | "setItem">;
const validId = (id: unknown) => typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

// Only opaque UUIDs persist. Identity/source/file fingerprints separate callers;
// file contents, payment amounts and references never enter browser storage.
export async function rememberEvidenceIntent(actor: string, scope: string, fingerprint: string, storage: IntentStorage) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([actor, scope, fingerprint]))));
  const key = "hx:evidence-intent:" + Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  try {
    const raw = storage.getItem(key);
    if (raw !== null) {
      const value = JSON.parse(raw) as Intent;
      if (!validId(value.create) || !validId(value.finalize)) throw new Error("invalid saved intent");
      return { key, create: value.create, finalize: value.finalize };
    }
    const value = { create: crypto.randomUUID(), finalize: crypto.randomUUID() };
    storage.setItem(key, JSON.stringify(value));
    return { key, ...value };
  } catch {
    throw new Error("Chưa lưu hoặc khôi phục được mã thao tác. Chưa gửi tệp; hãy kiểm tra dữ liệu lưu của trang rồi thử lại.");
  }
}
