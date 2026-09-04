import type { WorkforceSnapshot, WorkItemCard } from "@/modules/workforce/types";

const DRIVER_ID = "00000000-0000-4000-8000-000000000002";
const OPERATOR_ID = "00000000-0000-4000-8000-000000000003";

function item(
  id: string,
  input: Partial<WorkItemCard> & Pick<WorkItemCard, "title" | "status">,
): WorkItemCard {
  const { title, status, ...overrides } = input;
  return {
    id,
    workNumber: `WRK-2026-${id.slice(-6)}`,
    title,
    description: "Thực hiện đúng thứ tự, cập nhật tiến độ và báo ngay khi có vướng mắc.",
    workType: "DELIVERY",
    requiredRole: "DRIVER",
    assignmentMode: "POOL_CLAIM",
    status,
    priority: 2,
    assignedUserId: null,
    claimedBy: null,
    workerName: null,
    claimedAt: null,
    claimExpiresAt: null,
    startedAt: null,
    heartbeatDueAt: null,
    lastHeartbeatAt: null,
    completedAt: null,
    verifiedAt: null,
    blockedReason: null,
    externalEffectStarted: false,
    dueAt: "2026-09-04T09:30:00.000Z",
    sourceType: "DELIVERY",
    sourceId: `72000000-0000-4000-8000-${id.slice(-12)}`,
    deliveryNumber: `DLV-2026-${id.slice(-6)}`,
    customerName: "Công ty Xây dựng Minh Thành",
    pickupAddress: "Kho Hiền Xã, Từ Sơn, Bắc Ninh",
    dropAddress: "Công trường KĐT Đông Ngàn, Từ Sơn, Bắc Ninh",
    sourceStatus: "ASSIGNED",
    isEligible: true,
    ...overrides,
  };
}

const inProgress = item("a1000000-0000-4000-8000-000000000101", {
  title: "Giao cát vàng đến công trường Đông Ngàn",
  status: "IN_PROGRESS",
  assignmentMode: "DIRECT",
  assignedUserId: DRIVER_ID,
  claimedBy: DRIVER_ID,
  workerName: "Trần Văn Nam",
  claimedAt: "2026-09-04T07:50:00.000Z",
  startedAt: "2026-09-04T08:00:00.000Z",
  heartbeatDueAt: "2026-09-04T08:15:00.000Z",
  lastHeartbeatAt: "2026-09-04T08:00:00.000Z",
  externalEffectStarted: true,
  sourceStatus: "DISPATCHED",
});

const available = item("a1000000-0000-4000-8000-000000000102", {
  title: "Giao đá 1×2 đến KCN VSIP",
  status: "AVAILABLE",
  customerName: "Nhà thầu An Phú",
  dropAddress: "Khu công nghiệp VSIP Bắc Ninh",
  dueAt: "2026-09-04T11:00:00.000Z",
});

const blocked = item("a1000000-0000-4000-8000-000000000103", {
  title: "Bốc xếp xi măng khu A",
  status: "BLOCKED",
  workType: "OPERATION",
  requiredRole: "OPERATOR_WORKER",
  assignmentMode: "DIRECT",
  assignedUserId: OPERATOR_ID,
  claimedBy: OPERATOR_ID,
  workerName: "Lê Văn Dũng",
  blockedReason: "Xe nâng khu A đang chờ bảo dưỡng an toàn.",
  externalEffectStarted: true,
  startedAt: "2026-09-04T07:30:00.000Z",
  sourceType: "GENERAL",
  sourceId: null,
  deliveryNumber: null,
  customerName: null,
  pickupAddress: null,
  dropAddress: null,
  sourceStatus: null,
});

const done = item("a1000000-0000-4000-8000-000000000104", {
  title: "Giao xi măng PCB40 đến Yên Phong",
  status: "DONE",
  assignedUserId: DRIVER_ID,
  claimedBy: DRIVER_ID,
  workerName: "Trần Văn Nam",
  completedAt: "2026-09-04T07:10:00.000Z",
  sourceStatus: "CONFIRMED",
});

export const SYNTHETIC_WORKFORCE: WorkforceSnapshot = {
  assigned: [inProgress],
  pool: [available],
  attention: [blocked, done],
  completed: [done],
  notifications: [
    {
      id: "a2000000-0000-4000-8000-000000000001",
      workItemId: blocked.id,
      notificationType: "WORK_BLOCKED",
      title: "Công việc đang bị vướng",
      message: "Xe nâng khu A đang chờ bảo dưỡng an toàn.",
      actionPath: "/app/workforce",
      readAt: null,
      resolvedAt: null,
      createdAt: "2026-09-04T08:05:00.000Z",
      workNumber: blocked.workNumber,
      workStatus: blocked.status,
    },
  ],
  workers: [
    { userId: DRIVER_ID, displayName: "Trần Văn Nam", employeeCode: "TX-001", roles: ["DRIVER"] },
    { userId: OPERATOR_ID, displayName: "Lê Văn Dũng", employeeCode: "VH-004", roles: ["OPERATOR_WORKER"] },
  ],
};
