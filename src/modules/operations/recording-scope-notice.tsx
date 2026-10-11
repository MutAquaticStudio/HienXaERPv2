import { readOperationalState } from "./server";
import { recordingScopeText } from "./state";

export async function RecordingScopeNotice({ branchId }: { branchId: string }) {
 const state = await readOperationalState(branchId);
 return <p className="quality-callout" data-recording-scope="RECORDED_TRANSACTIONS">{recordingScopeText(state?.historicalQuality)}</p>;
}
