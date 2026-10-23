/** One option of a left-panel filter; `count` is what the list holds for it (capped, e.g. "99+"). */
export type FilterOption = { value: string; label: string; count?: number | string };

/** Rows of a count query fetched with `.limit(100)`: up to 99 exactly, then "99+" (D29 list pattern). */
export const countText = (rows: readonly unknown[] | null | undefined): number | string | undefined =>
  rows ? (rows.length > 99 ? "99+" : rows.length) : undefined;

/**
 * KiotViet-style filter group for the left panel (D29): radio rows with their counts, applied at once by the
 * surrounding AutoFilterForm. Give it `key={value}` so the checked row follows the address after "Xóa lọc".
 */
export function ListFilterGroup({ legend, name, value, options }: { legend: string; name: string; value: string; options: readonly FilterOption[] }) {
  return <fieldset className="list-filter-group">
    <legend>{legend}</legend>
    {options.map((option) => <label className="list-filter-option" key={option.value || "default"}>
      <input type="radio" name={name} value={option.value} defaultChecked={value === option.value} />
      <span>{option.label}</span>
      {option.count !== undefined && <span className="list-filter-count">{option.count}</span>}
    </label>)}
  </fieldset>;
}
