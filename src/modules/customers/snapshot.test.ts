import { describe, expect, it } from "vitest";
import { createPartySnapshot } from "./snapshot";

describe("customer transaction snapshot", () => {
  it("copies mutable profile fields into an immutable value", () => {
    const source = { customerId: "c1", customerName: "Minh Phát", siteId: "s1", siteName: "Kho A", deliveryAddress: "Phù Cừ", receiverName: "Minh", receiverPhone: "0900000000", salesOwnerEmployeeId: null };
    const snapshot = createPartySnapshot(source);
    source.deliveryAddress = "Địa chỉ mới";
    expect(snapshot.deliveryAddress).toBe("Phù Cừ");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});
