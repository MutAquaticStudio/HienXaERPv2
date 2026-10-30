import { expect, it } from "vitest";
import { baseMaps, DEFAULT_BASE_MAPS } from "./base-maps";

it("uses OpenStreetMap, which needs no key, when nothing is configured", () => {
  expect(baseMaps("", "")).toEqual(DEFAULT_BASE_MAPS);
  expect(baseMaps(undefined, undefined).map((base) => base.url)).toEqual(["https://tile.openstreetmap.org/{z}/{x}/{y}.png"]);
});

it("puts the configured tile address first and keeps the free ones as fallbacks (FB18)", () => {
  const maps = baseMaps(" https://tiles.example.com/voyager/{z}/{x}/{y}.png?api_key=abc ", "© OpenStreetMap © CARTO");
  expect(maps[0]).toEqual({ url: "https://tiles.example.com/voyager/{z}/{x}/{y}.png?api_key=abc", attribution: "© OpenStreetMap © CARTO" });
  expect(maps.slice(1)).toEqual(DEFAULT_BASE_MAPS);
});

it("ignores an address that is not an https tile template", () => {
  expect(baseMaps("http://tiles.example.com/{z}/{x}/{y}.png", "")).toEqual(DEFAULT_BASE_MAPS);
  expect(baseMaps("https://tiles.example.com/map.png", "")).toEqual(DEFAULT_BASE_MAPS);
  expect(baseMaps("https://x.example.com/{z}/{x}/{y}.png\"><script>", "")).toEqual(DEFAULT_BASE_MAPS);
});
