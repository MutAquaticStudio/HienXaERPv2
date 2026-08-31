import type { Principal } from "@/modules/platform/types";

export const SYNTHETIC_OFFICE_PRINCIPAL: Principal = {
  userId: "00000000-0000-4000-8000-000000000001",
  displayName: "Nguyễn Văn Hùng",
  status: "ACTIVE",
  roles: ["OWNER_ADMIN"],
  permissions: [
    "platform.access_office",
    "platform.access_worker",
    "finance.read",
    "margin.read",
    "work_item.read_assigned",
    "work_pool.read",
    "audit.view",
    "evidence.create",
    "evidence.read",
    "user.manage",
    "role.manage",
  ],
  scopes: [{ kind: "ALL" }],
};

export const SYNTHETIC_WORKER_PRINCIPAL: Principal = {
  userId: "00000000-0000-4000-8000-000000000002",
  displayName: "Trần Văn Nam",
  status: "ACTIVE",
  roles: ["DRIVER"],
  permissions: [
    "platform.access_worker",
    "work_item.read_assigned",
    "evidence.create",
    "evidence.read",
  ],
  scopes: [{ kind: "ASSIGNED_ONLY" }, { kind: "SELF" }],
};
