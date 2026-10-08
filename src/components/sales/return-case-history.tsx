type ReturnHistoryCase = {
  id: string; case_kind: string; base_quantity: string | number;
  reason: string; state: string; version: number;
};
const kinds: Record<string, string> = {
  CUSTOMER_RETURN: "Kh\u00e1ch tr\u1ea3 sau x\u00e1c minh",
  TRANSIT_RETURN: "Ph\u1ea7n ch\u01b0a giao tr\u1ea3 kho",
  TRANSIT_LOSS: "Hao h\u1ee5t \u0111ang giao",
};
const states: Record<string, string> = {
  RETURNED: "\u0110\u00e3 nh\u1eadn v\u1ec1 kho",
  LOSS_APPROVED: "\u0110\u00e3 duy\u1ec7t hao h\u1ee5t",
  CANCELLED: "\u0110\u00e3 h\u1ee7y h\u1ed3 s\u01a1",
};

export function ReturnCaseHistory({ cases }: { cases: readonly ReturnHistoryCase[] }) {
  const resolved = cases.filter((item) => item.state !== "OPEN");
  if (!resolved.length) return null;
  return <section className="source-history" aria-labelledby="return-history-heading">
    <h3 id="return-history-heading">{"L\u1ecbch s\u1eed x\u1eed l\u00fd giao h\u00e0ng"}</h3>
    {resolved.map((item) => <article className="exception-card" key={item.id}>
      <strong>{kinds[item.case_kind] ?? item.case_kind} {" \u00b7 "}{String(item.base_quantity)} base</strong>
      <p>{states[item.state] ?? item.state} {" \u00b7 "}<span className="mono">{item.state}</span> {" \u00b7 v"}{item.version}</p>
      <p>{item.reason}</p><p className="mono">{item.id}</p>
    </article>)}
  </section>;
}
