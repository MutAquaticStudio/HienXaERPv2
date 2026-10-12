import { Fragment } from "react";

/** Wrap an already formatted value at thousands separators, keeping each group readable. */
export function MetricNumber({ value }: { value: string }) {
  const groups = value.split(".");
  return <span className="metric-number">{groups.map((group, index) => <Fragment key={index}>
    <span className="metric-number-group">{group}{index < groups.length - 1 ? "." : ""}</span>
    {index < groups.length - 1 && <wbr />}
  </Fragment>)}</span>;
}
