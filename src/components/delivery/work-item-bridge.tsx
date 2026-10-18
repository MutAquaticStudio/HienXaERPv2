import { workStateLabel } from "@/modules/portal/presentation";
import { randomUUID } from "node:crypto";
import { formatBusinessDateTime } from "@/lib/core/business-time";

import { requireInternalPermission } from "@/lib/access/context";
import { createServerSupabase } from "@/lib/supabase/server";
import { publishDeliveryWorkItemAction, verifyDeliveryWorkItemAction } from "@/modules/workforce/delivery-actions";

export async function DeliveryWorkItemBridge({ deliveryId }: { deliveryId: string }) {
  const context = await requireInternalPermission("delivery.read");
  if (!context.permissions.has("workforce.read")) return null;
  const supabase = await createServerSupabase();
  const [deliveryResult, workResult] = await Promise.all([
    supabase.from("delivery_read").select("execution_state, scheduled_at, employee_id, receiver_name_snapshot, receiver_phone_snapshot, delivery_address_snapshot")
      .eq("id", deliveryId).eq("branch_id", context.branchId).maybeSingle(),
    supabase.from("work_item_read").select("id, work_number, execution_state, version, employee_name, scheduled_start")
      .eq("delivery_id", deliveryId).eq("branch_id", context.branchId).maybeSingle(),
  ]);
  if (deliveryResult.error || workResult.error) throw new Error("Không thể tải ngữ cảnh công việc giao hàng.");
  const delivery = deliveryResult.data;
  const work = workResult.data;
  const publishCandidate = !work && context.permissions.has("work.manage") && delivery?.execution_state === "ASSIGNED"
    && delivery.scheduled_at && delivery.employee_id;
  const contactReady = delivery?.receiver_name_snapshot?.trim() && delivery.receiver_phone_snapshot?.trim()
    && delivery.delivery_address_snapshot?.trim();
  const canPublish = publishCandidate && contactReady;
  // A2: assigning a driver makes the work item; only a delivery still missing its receiver waits here.
  const waitingForReceiver = !work && delivery?.execution_state === "ASSIGNED" && !!delivery.employee_id && !contactReady;
  if (!work && !publishCandidate && !waitingForReceiver) return null;

  return <section className="card card-pad">
    <h2>Công việc trên cổng thợ</h2>
    {waitingForReceiver && <p className="form-message" role="status">Việc chưa sang cổng thợ vì thiếu địa chỉ, tên hoặc điện thoại người nhận. Lưu người nhận ở khung bên cạnh, việc sẽ tự sang cổng thợ của người giao.</p>}
    {canPublish && <form action={publishDeliveryWorkItemAction}>
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <p>Phiếu được phân xe trước khi có tự giao việc. Đưa việc vào cổng của người giao đã phân công.</p>
      <button className="button button-primary" type="submit">Giao việc qua cổng thợ</button>
    </form>}
    {work && <>
      <p>Đã giao việc cho <strong>{work.employee_name ?? "người giao"}</strong>{work.scheduled_start ? ` · ${formatBusinessDateTime(work.scheduled_start)}` : ""}</p>
      <p className="muted"><span className="mono">{work.work_number}</span> · {workStateLabel(work.execution_state)}. Kết quả giao từng dòng vẫn được xác minh ở phiếu giao.</p>
      {context.permissions.has("work.verify") && work.execution_state === "DONE" && delivery?.execution_state === "VERIFIED" && <form action={verifyDeliveryWorkItemAction}>
        <input type="hidden" name="deliveryId" value={deliveryId} />
        <input type="hidden" name="workItemId" value={work.id} />
        <input type="hidden" name="version" value={work.version} />
        <input type="hidden" name="operationId" value={randomUUID()} />
        <button className="button button-secondary" type="submit">Xác minh công việc theo giao hàng</button>
      </form>}
    </>}
  </section>;
}
