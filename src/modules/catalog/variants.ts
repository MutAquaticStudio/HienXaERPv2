import { searchKey } from "@/components/documents/editor/search-text";

/** Attribute values of one variant, keyed by the group's attribute names (e.g. { "Mác": "PCB30" }). */
export type VariantAttributes = Record<string, string>;

export const MAX_VARIANT_ATTRIBUTES = 3;
export const MAX_VARIANTS = 60;
const MAX_VALUE_LENGTH = 40;

/** "PCB30, PCB40; PCB50" → ["PCB30", "PCB40", "PCB50"]: trimmed, without repeats (ignoring case). */
export function parseVariantValues(text: string): string[] {
  const seen = new Set<string>();
  return text.split(/[,;\n]/).map((value) => value.trim()).filter((value) => {
    const key = value.toLocaleLowerCase("vi");
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validVariantValue(value: string): boolean {
  return value.trim().length > 0 && value.trim().length <= MAX_VALUE_LENGTH;
}

/** Every combination of the attribute values, in the order typed: Mác × Màu → PCB30·Xám, PCB30·Trắng… */
export function variantCombos(names: string[], values: string[][]): VariantAttributes[] {
  if (!names.length || values.some((list) => !list.length)) return [];
  return names.reduce<VariantAttributes[]>((combos, name, index) =>
    combos.flatMap((combo) => values[index].map((value) => ({ ...combo, [name]: value }))), [{}]);
}

/** Stable identity of a combination, independent of key order. */
export function variantKey(names: string[], attributes: VariantAttributes): string {
  return JSON.stringify(names.map((name) => (attributes[name] ?? "").trim().toLocaleLowerCase("vi")));
}

function codePart(value: string): string {
  return searchKey(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Code stem from the product name: "Xi măng Bút Sơn" → "XMBS". */
export function variantCodePrefix(name: string): string {
  return searchKey(name).split(/\s+/).map((word) => codePart(word).charAt(0)).join("").slice(0, 12);
}

/** Suggested material code, editable before saving: XMBS + PCB30 → "XMBS-PCB30" (A–Z, 0–9, _ and -, at most 32). */
export function variantCode(prefix: string, names: string[], attributes: VariantAttributes): string {
  const stem = codePart(prefix).slice(0, 12);
  const values = names.map((name) => codePart(attributes[name] ?? "")).filter(Boolean).join("-");
  return [stem, values].filter(Boolean).join("-").slice(0, 32);
}

/**
 * Code stem the existing variants already use, so new ones follow it: BS-PCB30 / BS-PCB40 → "BS". Falls back to the
 * stem from the product name when the codes do not end with their attribute values.
 */
export function inferVariantCodePrefix(groupName: string, names: string[], members: { code: string; attributes: VariantAttributes }[]): string {
  const stems = new Set(members.map((member) => {
    const values = variantCode("", names, member.attributes);
    return values && member.code.endsWith(values) ? member.code.slice(0, -values.length).replace(/[-_]+$/, "") : null;
  }));
  const [stem] = [...stems];
  return stems.size === 1 && stem ? stem : variantCodePrefix(groupName);
}

/** Suggested material name: "Xi măng Bút Sơn" + PCB30 → "Xi măng Bút Sơn PCB30"; a bare number keeps its attribute ("Phi 10"). */
export function variantName(groupName: string, names: string[], attributes: VariantAttributes): string {
  const parts = names.map((name) => {
    const value = (attributes[name] ?? "").trim();
    return /^[\d.,\s/x×-]+$/i.test(value) ? `${name} ${value}` : value;
  }).filter(Boolean);
  return [groupName.trim(), ...parts].join(" ").slice(0, 160);
}

/** "Mác: PCB30 · Màu: Xám" for lists and search results. */
export function variantLabel(names: string[], attributes: VariantAttributes | null | undefined): string {
  if (!attributes) return "";
  const keys = names.length ? names : Object.keys(attributes);
  return keys.filter((name) => attributes[name]).map((name) => `${name}: ${attributes[name]}`).join(" · ");
}

export const MATERIAL_CODE_PATTERN = /^[A-Z0-9_-]{2,32}$/;

/** Variant info carried to the document editor's material search (F3), which lists variants under their product. */
export type EditorVariant = { groupId: string; name: string; label: string };
type EmbeddedVariantGroup = { name: string; attribute_names: string[] };

/** From a materials row selected with `variant_group_id, variant_attributes, material_variant_groups(name, attribute_names)`. */
export function editorVariant(row: { variant_group_id?: string | null; variant_attributes?: VariantAttributes | null; material_variant_groups?: EmbeddedVariantGroup | EmbeddedVariantGroup[] | null }): EditorVariant | undefined {
  const group = Array.isArray(row.material_variant_groups) ? row.material_variant_groups[0] : row.material_variant_groups;
  if (!row.variant_group_id || !group) return undefined;
  return { groupId: row.variant_group_id, name: group.name, label: variantLabel(group.attribute_names, row.variant_attributes) };
}

export const VARIANT_MATERIAL_COLUMNS = "variant_group_id, variant_attributes, material_variant_groups(name, attribute_names)";
