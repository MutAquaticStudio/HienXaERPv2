import { describe, expect, it } from "vitest";

import { parseDeliveryForm } from "@/modules/delivery/commands";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("P7 delivery command validation", () => {
  it("parses a driver progress action", () => {
    expect(parseDeliveryForm(form({
      kind: "delivery.progress",
      deliveryId: "delivery-001",
      nextStatus: "ARRIVED",
      reason: "Tài xế đã tới đúng điểm giao",
    }))).toMatchObject({ kind: "delivery.progress", nextStatus: "ARRIVED" });
  });

  it("requires proof shape for file and location evidence", () => {
    expect(() => parseDeliveryForm(form({
      kind: "delivery.proof",
      deliveryId: "delivery-001",
      proofType: "PHOTO",
    }))).toThrow(/Tệp bằng chứng/);
    expect(parseDeliveryForm(form({
      kind: "delivery.proof",
      deliveryId: "delivery-001",
      proofType: "LOCATION",
      latitude: "21.1212345",
      longitude: "105.9587654",
    }))).toMatchObject({ proofType: "LOCATION" });
  });

  it("rejects accepted quantity above actual", () => {
    expect(() => parseDeliveryForm(form({
      kind: "delivery.confirm",
      deliveryId: "delivery-001",
      deliveryLineId: "delivery-line-001",
      actualQuantity: "9",
      acceptedQuantity: "10",
      receiverName: "Nguyễn Văn An",
      reason: "Đối chiếu theo biên bản giao nhận",
    }))).toThrow(/không thể vượt/);
  });
});
