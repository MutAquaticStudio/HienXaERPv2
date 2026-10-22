import { randomUUID } from "node:crypto";
import { closeSalesOrderRemainingAction } from "./actions";

type Props = { orderId: string; commercialState: string; fulfillmentState: string; canClose: boolean };

export function CloseRemainingForm({ orderId, commercialState, fulfillmentState, canClose }: Props) {
  if (!canClose || commercialState !== "CONFIRMED" || fulfillmentState === "FULFILLED") return null;
  return <details className="card card-pad quick-create">
    <summary>{"\u0110\u00f3ng ph\u1ea7n c\u00f2n l\u1ea1i"}</summary>
    <p className="muted">{"Ch\u1ec9 \u0111\u00f3ng s\u1ed1 l\u01b0\u1ee3ng ch\u01b0a giao. Gi\u1eef nguy\u00ean k\u1ebft qu\u1ea3, kho, doanh thu v\u00e0 c\u00f4ng n\u1ee3 \u0111\u00e3 ghi. C\u1ea7n x\u1eed l\u00fd h\u1ebft giao h\u00e0ng/ngo\u1ea1i l\u1ec7 \u0111ang m\u1edf."}</p>
    <form className="command-panel" action={closeSalesOrderRemainingAction}>
      <input type="hidden" name="entityId" value={orderId} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <label className="field">{"Ghi ch\u00fa (kh\u00f4ng b\u1eaft bu\u1ed9c)"}<textarea name="reason" maxLength={500} /></label>
      <button className="button button-secondary" type="submit">{"\u0110\u00f3ng ph\u1ea7n c\u00f2n l\u1ea1i"}</button>
    </form>
  </details>;
}
