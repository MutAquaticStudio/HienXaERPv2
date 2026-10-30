export type BaseMap = { url: string; attribution: string };

/**
 * Without configuration: OpenStreetMap's own tiles, which need no key. CARTO's public tiles were dropped: they now answer
 * every request with an "API KEY REQUIRED" picture (HTTP 200, so no tile error and no switch to a fallback).
 */
export const DEFAULT_BASE_MAPS: BaseMap[] = [
  { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap" },
];

/**
 * FB18: the base map can be set on Vercel without a code change — e.g. the tile address of the business's CARTO plan, with its
 * key. `NEXT_PUBLIC_MAP_TILE_URL` must be an https tile template with {z}, {x} and {y}; a malformed value is ignored. The
 * browser downloads the tiles, so the address (and any key in it) is visible to staff — use a key restricted to the app's domain.
 */
export function baseMaps(url = process.env.NEXT_PUBLIC_MAP_TILE_URL, attribution = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION): BaseMap[] {
  const configured = url?.trim();
  if (!configured || !/^https:\/\/[^\s"'<>]+$/.test(configured) || !["{z}", "{x}", "{y}"].every((part) => configured.includes(part))) return DEFAULT_BASE_MAPS;
  return [{ url: configured, attribution: attribution?.trim() || "© OpenStreetMap © CARTO" },
    ...DEFAULT_BASE_MAPS.filter((base) => base.url !== configured)];
}
