import type {
  CustomerPortalPrincipal,
  CustomerPortalSnapshot,
} from "@/modules/customer-portal/types";

export const SYNTHETIC_CUSTOMER_PORTAL_PRINCIPAL: CustomerPortalPrincipal = {
  authUserId: "00000000-0000-4000-8000-000000000003",
  customerId: "00000000-0000-4000-8000-000000000103",
  customerName: "Công ty Xây dựng An Phát",
  portalRole: "BILLING",
};

export const SYNTHETIC_CUSTOMER_PORTAL_SNAPSHOT: CustomerPortalSnapshot = {
  customerName: SYNTHETIC_CUSTOMER_PORTAL_PRINCIPAL.customerName,
  portalRole: SYNTHETIC_CUSTOMER_PORTAL_PRINCIPAL.portalRole,
  quotes: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      quotationNumber: "BG-2026-0018",
      revisionId: "00000000-0000-4000-8000-000000000202",
      revisionNumber: 2,
      status: "SENT",
      validUntil: "2026-09-20",
      currency: "VND",
      totalAmount: "18650000",
      notes: "Giao tại công trường theo lịch đã thống nhất.",
      lines: [
        {
          id: "00000000-0000-4000-8000-000000000203",
          materialName: "Xi măng PCB40",
          quantity: "50",
          uomSymbol: "bao",
          unitPrice: "105000",
          lineAmount: "5250000",
        },
        {
          id: "00000000-0000-4000-8000-000000000204",
          materialName: "Cát xây",
          quantity: "20",
          uomSymbol: "m³",
          unitPrice: "670000",
          lineAmount: "13400000",
        },
      ],
    },
  ],
  orders: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      orderNumber: "SO-2026-0042",
      status: "FULFILLING",
      createdAt: "2026-09-02T08:00:00.000Z",
      siteName: "Công trường Bình Thạnh",
      totalAmount: "23500000",
      currency: "VND",
      lines: [
        {
          id: "00000000-0000-4000-8000-000000000302",
          materialId: "00000000-0000-4000-8000-000000000401",
          materialName: "Đá 1x2",
          quantity: "30",
          uomId: "00000000-0000-4000-8000-000000000501",
          uomSymbol: "m³",
        },
      ],
    },
  ],
  deliveries: [
    {
      id: "00000000-0000-4000-8000-000000000601",
      deliveryNumber: "DLV-2026-0081",
      orderNumber: "SO-2026-0042",
      siteName: "Công trường Bình Thạnh",
      scheduledDate: "2026-09-04",
      deliveredAt: "2026-09-04T09:30:00.000Z",
      status: "DELIVERED",
      canAcknowledge: true,
      acknowledgementId: null,
      trackingFreshness: null,
      progressMessage: "Theo dõi theo trạng thái giao hàng đã được ghi nhận.",
      etaMessage: "Dự kiến đến: chuyến đã hoàn tất giao hàng.",
      lines: [
        {
          id: "00000000-0000-4000-8000-000000000602",
          materialName: "Đá 1x2",
          plannedQuantity: "30",
          actualQuantity: "30",
          acceptedQuantity: "30",
          uomSymbol: "m³",
        },
      ],
    },
  ],
  debts: [
    {
      id: "00000000-0000-4000-8000-000000000701",
      documentNumber: "PT-2026-0037",
      orderNumber: "SO-2026-0042",
      originalAmount: "23500000",
      outstandingAmount: "23500000",
      currency: "VND",
      dueDate: "2026-09-15",
      status: "OPEN",
    },
  ],
  sites: [
    { id: "00000000-0000-4000-8000-000000000801", name: "Công trường Bình Thạnh" },
  ],
  materials: [
    {
      id: "00000000-0000-4000-8000-000000000401",
      name: "Đá 1x2",
      uomId: "00000000-0000-4000-8000-000000000501",
      uomSymbol: "m³",
    },
    {
      id: "00000000-0000-4000-8000-000000000402",
      name: "Xi măng PCB40",
      uomId: "00000000-0000-4000-8000-000000000502",
      uomSymbol: "bao",
    },
  ],
  quoteRequests: [],
  paymentNotices: [],
};
