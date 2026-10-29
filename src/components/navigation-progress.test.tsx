import { describe, expect, it } from "vitest";

import { isInternalNavigation } from "./navigation-progress";

const at = new URL("/admin/orders?state=DRAFT", window.location.href) as unknown as Location;
function click(href: string, keys: { ctrlKey?: boolean } = {}, attributes: Record<string, string> = {}) {
  const anchor = document.createElement("a");
  anchor.href = href;
  for (const [name, value] of Object.entries(attributes)) anchor.setAttribute(name, value);
  const inner = document.createElement("span");
  anchor.append(inner);
  return { button: 0, defaultPrevented: false, metaKey: false, ctrlKey: !!keys.ctrlKey, shiftKey: false, altKey: false, target: inner } as unknown as MouseEvent;
}

describe("top progress bar (FB17)", () => {
  it("starts for a click that opens another screen of the app in the same tab", () => {
    expect(isInternalNavigation(click("/admin/customers"), at)).toBe(true);
    expect(isInternalNavigation(click("/admin/orders?state=ALL"), at)).toBe(true);
  });
  it("ignores the same screen, new tabs, downloads, files and other sites", () => {
    expect(isInternalNavigation(click("/admin/orders?state=DRAFT"), at)).toBe(false);
    expect(isInternalNavigation(click("/admin/customers", { ctrlKey: true }), at)).toBe(false);
    expect(isInternalNavigation(click("/admin/customers", {}, { target: "_blank" }), at)).toBe(false);
    expect(isInternalNavigation(click("/api/orders/1/pdf"), at)).toBe(false);
    expect(isInternalNavigation(click("/admin/x.xlsx", {}, { download: "" }), at)).toBe(false);
    expect(isInternalNavigation(click("https://zalo.me/123"), at)).toBe(false);
  });
});
