import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningSourceTrace } from "./earning-source-trace";
it("shows actual result, work, verification and Vietnam effective timestamp", () => {
  const html = renderToStaticMarkup(<EarningSourceTrace source={{ source_key: "WORK_ITEM_VERIFICATION:v", work_item_id: "work-id", work_item_result_id: "result-id", work_item_verification_id: "verification-id", work_verified_at: "2026-10-08T01:00:00Z", recognition_effective_at: "2026-10-06T17:00:00Z" }} />);
  for (const value of ["work-id", "result-id", "verification-id", "08:00", "00:00", "07/10/2026"]) expect(html).toContain(value);
});

it.each(["MANUAL_BASIS", "SERVICE_VERIFICATION"])("preserves distinct %s source references alongside the Vietnamese label", (kind) => {
  const references = ["c20c5839-c728-4e29-901f-558b35db9df1", "7806a8a5-f58f-42c1-a3ef-7bcfdcde143a"];
  const sources = references.map(reference => ({ source_key: `${kind}:${reference}` }));
  const markup = sources.map(source => renderToStaticMarkup(<EarningSourceTrace source={source} />));
  for (const [index, html] of markup.entries()) {
    expect(html).toContain("Mã nguồn:");
    expect(html).toContain(references[index]);
    expect(html).not.toContain(kind);
    expect(sources[index].source_key).toBe(`${kind}:${references[index]}`);
  }
  expect(markup[0]).not.toBe(markup[1]);
});
