import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningSourceTrace } from "./earning-source-trace";
it("shows actual result, work, verification and Vietnam effective timestamp", () => {
  const html = renderToStaticMarkup(<EarningSourceTrace source={{ source_key: "WORK_ITEM_VERIFICATION:v", work_item_id: "work-id", work_item_result_id: "result-id", work_item_verification_id: "verification-id", work_verified_at: "2026-10-08T01:00:00Z", recognition_effective_at: "2026-10-06T17:00:00Z" }} />);
  for (const value of ["work-id", "result-id", "verification-id", "08:00", "00:00", "07/10/2026"]) expect(html).toContain(value);
});
