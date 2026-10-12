// @vitest-environment node
import { expect, it } from "vitest";
import { rememberEvidenceIntent } from "./evidence-intent";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
it("restores the same upload/finalize intent after reload using only opaque stored identifiers", async () => {
  const saved = storage();
  const first = await rememberEvidenceIntent("actor", "purchase-order", "file-sha", saved);
  expect(await rememberEvidenceIntent("actor", "purchase-order", "file-sha", saved)).toEqual(first);
  const raw = [...saved.values.entries()].flat().join(" ");
  expect(raw).not.toMatch(/actor|purchase-order|file-sha/);
  expect(Object.keys(JSON.parse(saved.values.get(first.key)!))).toEqual(["create", "finalize"]);
});
it("separates other actors, sources and file contents", async () => {
  const saved = storage();
  const original = await rememberEvidenceIntent("a", "po1", "sha1", saved);
  for (const [actor, source, checksum] of [["b", "po1", "sha1"], ["a", "po2", "sha1"], ["a", "po1", "sha2"]]) {
    expect((await rememberEvidenceIntent(actor, source, checksum, saved)).create).not.toBe(original.create);
  }
});
it("does not silently mint a new intent when storage is blocked or the saved receipt is damaged", async () => {
  await expect(rememberEvidenceIntent("a", "po", "sha", { getItem: () => null, setItem: () => { throw new Error("disabled"); } })).rejects.toThrow("Chưa gửi tệp");
  const saved = storage(), first = await rememberEvidenceIntent("a", "po", "sha", saved);
  saved.values.set(first.key, "broken");
  await expect(rememberEvidenceIntent("a", "po", "sha", saved)).rejects.toThrow("Chưa gửi tệp");
  expect(saved.values.get(first.key)).toBe("broken");
});
