import type { OperationalChatSnapshot } from "@/modules/chat/types";

export const SYNTHETIC_WORKER_CHAT: OperationalChatSnapshot = {
  conversations: [
    {
      id: "00000000-0000-4000-8000-000000000a01",
      contextType: "DELIVERY",
      contextId: "72000000-0000-4000-8000-000000000002",
      subject: "Chuyến giao DLV-2026-000013",
      status: "OPEN",
      closedAt: null,
      closeReason: null,
      unreadCount: 1,
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000a02",
          senderUserId: "00000000-0000-4000-8000-000000000001",
          senderKind: "EMPLOYEE",
          senderDisplayName: "Điều phối Hiền Xa",
          body: "Khi đến công trường, hãy cập nhật tiến độ giao theo nút nghiệp vụ chính thức.",
          evidenceId: null,
          createdAt: "2026-09-04T07:30:00.000Z",
        },
      ],
    },
  ],
  evidence: [],
};

export const SYNTHETIC_CUSTOMER_CHAT: OperationalChatSnapshot = {
  conversations: [
    {
      id: "00000000-0000-4000-8000-000000000a11",
      contextType: "SALES_ORDER",
      contextId: "00000000-0000-4000-8000-000000000301",
      subject: "Đơn hàng SO-2026-0042",
      status: "OPEN",
      closedAt: null,
      closeReason: null,
      unreadCount: 0,
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000a12",
          senderUserId: "00000000-0000-4000-8000-000000000001",
          senderKind: "EMPLOYEE",
          senderDisplayName: "Nhân viên phụ trách",
          body: "Chúng tôi đang theo dõi đơn hàng. Mọi xác nhận nghiệp vụ vẫn dùng nút chính thức trên portal.",
          evidenceId: null,
          createdAt: "2026-09-03T08:00:00.000Z",
        },
      ],
    },
  ],
  evidence: [],
};

export const SYNTHETIC_OFFICE_CHAT: OperationalChatSnapshot = {
  conversations: [
    {
      id: "00000000-0000-4000-8000-000000000a21",
      contextType: "DELIVERY",
      contextId: "72000000-0000-4000-8000-000000000002",
      subject: "Chuyến giao DLV-2026-000013",
      status: "OPEN",
      closedAt: null,
      closeReason: null,
      unreadCount: 1,
      messages: [
        {
          id: "00000000-0000-4000-8000-000000000a22",
          senderUserId: "00000000-0000-4000-8000-000000000002",
          senderKind: "EMPLOYEE",
          senderDisplayName: "Tài xế Trần Văn Nam",
          body: "Tôi đã nhận lộ trình. Sẽ dùng nút cập nhật giao hàng khi phát sinh thực tế.",
          evidenceId: null,
          createdAt: "2026-09-04T07:35:00.000Z",
        },
      ],
    },
  ],
  evidence: [],
};
