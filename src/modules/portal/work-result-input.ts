import { z } from "zod";
import { isExactEntryQuantity } from "@/lib/core/quantity";

// JSON numbers can lose significant digits before validation; portal producers send decimal text.
const quantity = z.string().trim().min(1)
  .refine((value) => isExactEntryQuantity(value, true), "Số lượng phải là số hữu hạn không âm, tối đa 6 chữ số thập phân");
const common = z.object({
  workItemId: z.guid(), operationId: z.guid(), expectedVersion: z.number().int().positive(),
  receiverName: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).default(""),
  evidenceId: z.guid().nullish(),
});
const scalar = common.extend({ actualQuantity: quantity });
const delivery = common.extend({
  deliveryLines: z.array(z.object({ deliveryLineId: z.guid(), actualQuantity: quantity })).min(1).max(50),
  expectedDeliveryVersion: z.number().int().positive(),
  expectedAssignmentVersion: z.number().int().positive(),
  missingArrivalReason: z.string().trim().max(1000).default(""),
}).refine((value) => new Set(value.deliveryLines.map((line) => line.deliveryLineId)).size === value.deliveryLines.length,
  "Mỗi dòng giao chỉ được gửi một lần");

export function parseWorkResultInput(value: unknown) {
  const isDelivery = !!value && typeof value === "object" && "deliveryLines" in value;
  const parsed = isDelivery ? delivery.safeParse(value) : scalar.safeParse(value);
  if (!parsed.success) throw new Error("Kết quả công việc không hợp lệ. Kiểm tra từng dòng và phiên bản công việc.");
  return parsed.data;
}
