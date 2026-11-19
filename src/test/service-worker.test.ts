// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

/** Loads public/sw.js with a stand-in `self` and returns what a tap on a notification with `link` opens. */
async function openedFor(link: unknown) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const openWindow = vi.fn(async () => null);
  const self = {
    location: new URL("https://app.example.test/sw.js"),
    addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; },
    clients: { matchAll: async () => [], openWindow },
    registration: { showNotification: async () => undefined },
  };
  runInNewContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), { self, URL });
  let pending: Promise<unknown> = Promise.resolve();
  listeners.notificationclick({ notification: { close() {}, data: { link } }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
  await pending;
  return (openWindow.mock.calls[0] as unknown[] | undefined)?.[0];
}

it("D97 (G-8): a notification opens only pages of this app", async () => {
  expect(await openedFor("/admin/orders/1")).toBe("https://app.example.test/admin/orders/1");
  expect(await openedFor("https://app.example.test/work")).toBe("https://app.example.test/work");
  for (const link of ["https://evil.example/phish", "//evil.example/x", "javascript:alert(1)", "http://app.example.test/", null, 42]) {
    expect(await openedFor(link)).toBe("https://app.example.test/");
  }
});
