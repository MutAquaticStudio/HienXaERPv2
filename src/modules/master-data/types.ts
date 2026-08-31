export const UOM_DIMENSIONS = [
  "MASS",
  "VOLUME",
  "COUNT",
  "LENGTH",
  "AREA",
  "OTHER",
] as const;

export type UomDimension = (typeof UOM_DIMENSIONS)[number];

export const CONVERSION_METHODS = [
  "EXACT",
  "PACKAGING",
  "ESTIMATED",
  "MEASURED",
] as const;

export type ConversionMethod = (typeof CONVERSION_METHODS)[number];

export const WORKER_SKILL_LEVELS = [
  "BASIC",
  "QUALIFIED",
  "ADVANCED",
  "EXPERT",
] as const;

export type WorkerSkillLevel = (typeof WORKER_SKILL_LEVELS)[number];

export interface ActiveMasterRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface MaterialGroup extends ActiveMasterRecord {
  description?: string | null;
}

export interface Uom extends ActiveMasterRecord {
  symbol: string;
  dimension: UomDimension;
  decimalScale: number;
}

export interface Material extends ActiveMasterRecord {
  groupId: string;
  groupName: string;
  baseUomId: string;
  baseUomSymbol: string;
  purchaseUomId: string;
  purchaseUomSymbol: string;
  salesUomId: string;
  salesUomSymbol: string;
}

export interface MaterialConversion {
  id: string;
  materialId: string;
  materialName: string;
  fromUomId: string;
  fromUomSymbol: string;
  toUomId: string;
  toUomSymbol: string;
  sourceQuantity: string;
  targetQuantity: string;
  method: ConversionMethod;
  roundingScale: number;
  version: number;
  isCurrent: boolean;
}

export interface Warehouse extends ActiveMasterRecord {
  address?: string | null;
}

export interface Vehicle extends ActiveMasterRecord {
  plateNumber: string;
  vehicleType: string;
  homeWarehouseId?: string | null;
  homeWarehouseName?: string | null;
  maxPayloadKg?: string | null;
  maxVolumeM3?: string | null;
}

export interface VehicleLoadProfile {
  id: string;
  vehicleId: string;
  vehicleName: string;
  targetName: string;
  plannedQuantity: string;
  uomId: string;
  uomSymbol: string;
  isActive: boolean;
  profileKind: "PLANNING_CAPACITY";
}

export interface WorkerSkill {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface EmployeeOption {
  userId: string;
  displayName: string;
  status: string;
}

export interface EmployeeOperationalProfile {
  userId: string;
  displayName: string;
  employeeCode: string;
  homeWarehouseId?: string | null;
  homeWarehouseName?: string | null;
  jobTitle?: string | null;
  isActive: boolean;
}

export interface WorkerSkillAssignment {
  userId: string;
  displayName: string;
  skillId: string;
  skillName: string;
  level: WorkerSkillLevel;
  isActive: boolean;
}

export interface MasterDataSnapshot {
  materialGroups: MaterialGroup[];
  uoms: Uom[];
  materials: Material[];
  conversions: MaterialConversion[];
  warehouses: Warehouse[];
  vehicles: Vehicle[];
  vehicleLoadProfiles: VehicleLoadProfile[];
  workerSkills: WorkerSkill[];
  employees: EmployeeOption[];
  employeeProfiles: EmployeeOperationalProfile[];
  workerSkillAssignments: WorkerSkillAssignment[];
}

export type MasterEntityKind =
  | "material-group"
  | "uom"
  | "material"
  | "conversion"
  | "warehouse"
  | "vehicle"
  | "vehicle-load-profile"
  | "employee-profile"
  | "worker-skill"
  | "worker-skill-assignment";

export type ToggleableMasterEntity = Exclude<
  MasterEntityKind,
  "conversion" | "worker-skill-assignment"
>;
