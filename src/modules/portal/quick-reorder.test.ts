import { expect, it } from "vitest";

import { quickReorders, type QuickReorder } from "./quick-reorder";

const card = (key: string, kind: QuickReorder["kind"], at: string): QuickReorder => ({ key, kind, at, title: key, href: `/x/${key}` });

it("offers the newest goods order and the newest service together, newest first (D75)", () => {
  const cards = quickReorders(
    [card("g1", "goods", "2026-11-10T00:00:00Z"), card("g2", "goods", "2026-11-09T00:00:00Z")],
    [card("s1", "service", "2026-11-08T00:00:00Z")],
  );
  expect(cards.map((item) => item.key)).toEqual(["g1", "s1"]);
});

it("fills both places with one kind when the other has nothing, and nothing when there is nothing", () => {
  expect(quickReorders([card("g1", "goods", "2026-11-10T00:00:00Z"), card("g2", "goods", "2026-11-12T00:00:00Z"), card("g3", "goods", "2026-11-01T00:00:00Z")], []).map((item) => item.key)).toEqual(["g2", "g1"]);
  expect(quickReorders([], [card("s1", "service", "2026-11-10T00:00:00Z")]).map((item) => item.key)).toEqual(["s1"]);
  expect(quickReorders([], [])).toEqual([]);
});
