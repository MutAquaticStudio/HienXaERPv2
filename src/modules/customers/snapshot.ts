import { AppError } from "@/lib/core/errors";

export type PartySnapshot = Readonly<{
  customerId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  deliveryAddress: string;
  receiverName: string;
  receiverPhone: string;
  salesOwnerEmployeeId: string | null;
}>;

export function createPartySnapshot(input: PartySnapshot): PartySnapshot {
  if (!input.customerId || !input.siteId || !input.customerName.trim() || !input.siteName.trim() || !input.deliveryAddress.trim()) {
    throw new AppError({ code: "VALIDATION_FAILED", message: "Thiếu thông tin snapshot khách hàng/công trình.", status: 422 });
  }
  return Object.freeze({ ...input });
}
