import { Fragment } from "react";

/** Wrap formatted values at thousands or decimal separators without splitting digit groups. */
export function MetricNumber({ value }: { value: string }) {
  const groups = value.match(/[^.,]+[.,]?/g) ?? [value];
  return <span className="metric-number">{groups.map((group, index) => <Fragment key={index}>
    <span className="metric-number-group">{group}</span>
    {index < groups.length - 1 && <wbr />}
  </Fragment>)}</span>;
}
