import { parseSnapshotView } from "@/modules/platform/snapshot-view";
import { randomUUID } from "node:crypto";

import type { Metadata } from "next";

import { AccessDenied } from "@/components/access-denied";
import { MasterDataWorkspace } from "@/components/master-data-workspace";
import { getMasterDataSnapshot } from "@/modules/master-data/service";
import type {
  MasterEntityKind,
  ToggleableMasterEntity,
} from "@/modules/master-data/types";
import { hasPermission } from "@/modules/platform/authorization";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export const metadata: Metadata = { title: "Dữ liệu vật liệu & UOM" };

const formKinds: MasterEntityKind[] = [
  "material-group",
  "uom",
  "material",
  "conversion",
  "warehouse",
  "vehicle",
  "vehicle-load-profile",
  "employee-profile",
  "worker-skill",
  "worker-skill-assignment",
];

export default async function MasterDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const principal = await getCurrentPrincipal("office");
  if (!principal || !hasPermission(principal, "master_data.read")) {
    return <AccessDenied />;
  }

  const view = parseSnapshotView(await searchParams, ["materials","operations","people"]);
  const data = await getMasterDataSnapshot(principal, view);
  const initialKeys = Object.fromEntries(
    formKinds.map((kind) => [kind, randomUUID()]),
  ) as Record<MasterEntityKind, string>;

  const toggleRecords: { kind: ToggleableMasterEntity; id: string }[] = [
    ...data.materialGroups.map((item) => ({
      kind: "material-group" as const,
      id: item.id,
    })),
    ...data.uoms.map((item) => ({ kind: "uom" as const, id: item.id })),
    ...data.materials.map((item) => ({
      kind: "material" as const,
      id: item.id,
    })),
    ...data.warehouses.map((item) => ({
      kind: "warehouse" as const,
      id: item.id,
    })),
    ...data.vehicles.map((item) => ({ kind: "vehicle" as const, id: item.id })),
    ...data.vehicleLoadProfiles.map((item) => ({
      kind: "vehicle-load-profile" as const,
      id: item.id,
    })),
    ...data.employeeProfiles.map((item) => ({
      kind: "employee-profile" as const,
      id: item.userId,
    })),
    ...data.workerSkills.map((item) => ({
      kind: "worker-skill" as const,
      id: item.id,
    })),
  ];
  const toggleKeys = Object.fromEntries(
    toggleRecords.map((item) => [`${item.kind}:${item.id}`, randomUUID()]),
  );

  return (
    <MasterDataWorkspace
      key={view.tab + (view.after ?? "")}
      initialTab={view.tab as "materials" | "operations" | "people"}
      data={data}
      initialKeys={initialKeys}
      toggleKeys={toggleKeys}
    />
  );
}
