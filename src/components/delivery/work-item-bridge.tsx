import { randomUUID } from "node:crypto";

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
    supabase.from("work_item_read").select("id, work_number, execution_state, version")
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
  if (!work && !publishCandidate) return null;

  return <section className="card card-pad">
    <h2>Công việc trên cổng thợ</h2>
    <p className="muted">Công việc điều phối không thay thế kết quả giao hàng từng dòng hoặc tự ghi công nợ/thu nhập.</p>
    {publishCandidate && !contactReady && <p className="form-message" role="status">Chưa thể phát hành: bổ sung địa chỉ, tên và điện thoại người nhận trước bàn giao.</p>}
    {canPublish && <form action={publishDeliveryWorkItemAction}>
      <input type="hidden" name="deliveryId" value={deliveryId} />
      <input type="hidden" name="operationId" value={randomUUID()} />
      <p>Đưa giao hàng này vào cổng của nhân viên đã phân công, trước khi bàn giao hàng.</p>
      <button className="button button-primary" type="submit">Giao việc qua cổng thợ</button>
    </form>}
    {work && <>
      <p><strong>{work.work_number}</strong> · {work.execution_state}</p>
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
