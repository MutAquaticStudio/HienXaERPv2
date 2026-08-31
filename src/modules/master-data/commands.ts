import {
  CONVERSION_METHODS,
  UOM_DIMENSIONS,
  WORKER_SKILL_LEVELS,
  type ConversionMethod,
  type MasterEntityKind,
  type ToggleableMasterEntity,
  type UomDimension,
  type WorkerSkillLevel,
} from "@/modules/master-data/types";
import { PlatformError } from "@/modules/platform/errors";

interface BaseCommand {
  kind: MasterEntityKind;
}

export type SaveMasterDataInput =
  | (BaseCommand & {
      kind: "material-group";
      code: string;
      name: string;
      description: string | null;
    })
  | (BaseCommand & {
      kind: "uom";
      code: string;
      symbol: string;
      name: string;
      dimension: UomDimension;
      decimalScale: number;
    })
  | (BaseCommand & {
      kind: "material";
      code: string;
      name: string;
      groupId: string;
      baseUomId: string;
      purchaseUomId: string;
      salesUomId: string;
    })
  | (BaseCommand & {
      kind: "conversion";
      materialId: string;
      fromUomId: string;
      sourceQuantity: string;
      targetQuantity: string;
      method: ConversionMethod;
      roundingScale: number;
    })
  | (BaseCommand & {
      kind: "warehouse";
      code: string;
      name: string;
      address: string | null;
    })
  | (BaseCommand & {
      kind: "vehicle";
      code: string;
      plateNumber: string;
      vehicleType: string;
      homeWarehouseId: string | null;
      maxPayloadKg: string | null;
      maxVolumeM3: string | null;
    })
  | (BaseCommand & {
      kind: "vehicle-load-profile";
      vehicleId: string;
      materialId: string | null;
      materialGroupId: string | null;
      plannedQuantity: string;
      uomId: string;
      notes: string | null;
    })
  | (BaseCommand & {
      kind: "employee-profile";
      userId: string;
      employeeCode: string;
      homeWarehouseId: string | null;
      jobTitle: string | null;
    })
  | (BaseCommand & {
      kind: "worker-skill";
      code: string;
      name: string;
      description: string | null;
    })
  | (BaseCommand & {
      kind: "worker-skill-assignment";
      userId: string;
      skillId: string;
      level: WorkerSkillLevel;
    });

export interface ToggleMasterDataInput {
  kind: ToggleableMasterEntity;
  id: string;
  isActive: boolean;
}

function invalid(message: string): never {
  throw new PlatformError(message, "INVALID_MASTER_DATA", 400);
}

function readText(
  formData: FormData,
  name: string,
  label: string,
  maximum = 180,
): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim().length < 1) {
    return invalid(`${label} là bắt buộc.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    return invalid(`${label} không được vượt quá ${maximum} ký tự.`);
  }
  return normalized;
}

function readOptionalText(
  formData: FormData,
  name: string,
  maximum = 500,
): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim();
  if (normalized.length > maximum) {
    return invalid(`Nội dung không được vượt quá ${maximum} ký tự.`);
  }
  return normalized;
}

function readCode(formData: FormData, name = "code"): string {
  const code = readText(formData, name, "Mã", 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(code)) {
    return invalid("Mã chỉ gồm chữ in hoa, số, gạch ngang hoặc gạch dưới.");
  }
  return code;
}

function readIdentifier(
  formData: FormData,
  name: string,
  label: string,
  optional = false,
): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    if (optional) return null;
    return invalid(`${label} là bắt buộc.`);
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(value)) {
    return invalid(`${label} không hợp lệ.`);
  }
  return value;
}

function readPositiveDecimal(
  formData: FormData,
  name: string,
  label: string,
  optional = false,
): string | null {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    if (optional) return null;
    return invalid(`${label} là bắt buộc.`);
  }
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized) || Number(normalized) <= 0) {
    return invalid(`${label} phải là số dương, tối đa 6 chữ số thập phân.`);
  }
  return normalized;
}

function readScale(
  formData: FormData,
  name = "roundingScale",
  label = "Số chữ số làm tròn",
): number {
  const value = Number(readText(formData, name, label, 1));
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    return invalid(`${label} phải từ 0 đến 6.`);
  }
  return value;
}

export function parseSaveMasterDataForm(
  formData: FormData,
): SaveMasterDataInput {
  const kind = readText(formData, "kind", "Loại dữ liệu") as MasterEntityKind;
  switch (kind) {
    case "material-group":
      return {
        kind,
        code: readCode(formData),
        name: readText(formData, "name", "Tên nhóm"),
        description: readOptionalText(formData, "description"),
      };
    case "uom": {
      const dimension = readText(
        formData,
        "dimension",
        "Loại đơn vị",
      ) as UomDimension;
      if (!UOM_DIMENSIONS.includes(dimension))
        return invalid("Loại đơn vị không hợp lệ.");
      return {
        kind,
        code: readCode(formData),
        symbol: readText(formData, "symbol", "Ký hiệu", 16),
        name: readText(formData, "name", "Tên đơn vị"),
        dimension,
        decimalScale: readScale(
          formData,
          "decimalScale",
          "Số chữ số thập phân",
        ),
      };
    }
    case "material":
      return {
        kind,
        code: readCode(formData),
        name: readText(formData, "name", "Tên vật liệu"),
        groupId: readIdentifier(formData, "groupId", "Nhóm vật liệu")!,
        baseUomId: readIdentifier(formData, "baseUomId", "Đơn vị gốc")!,
        purchaseUomId: readIdentifier(formData, "purchaseUomId", "Đơn vị mua")!,
        salesUomId: readIdentifier(formData, "salesUomId", "Đơn vị bán")!,
      };
    case "conversion": {
      const method = readText(
        formData,
        "method",
        "Phương pháp",
      ) as ConversionMethod;
      if (!CONVERSION_METHODS.includes(method))
        return invalid("Phương pháp quy đổi không hợp lệ.");
      return {
        kind,
        materialId: readIdentifier(formData, "materialId", "Vật liệu")!,
        fromUomId: readIdentifier(formData, "fromUomId", "Đơn vị nguồn")!,
        sourceQuantity: readPositiveDecimal(
          formData,
          "sourceQuantity",
          "Số lượng nguồn",
        )!,
        targetQuantity: readPositiveDecimal(
          formData,
          "targetQuantity",
          "Số lượng gốc",
        )!,
        method,
        roundingScale: readScale(formData),
      };
    }
    case "warehouse":
      return {
        kind,
        code: readCode(formData),
        name: readText(formData, "name", "Tên kho"),
        address: readOptionalText(formData, "address"),
      };
    case "vehicle":
      return {
        kind,
        code: readCode(formData),
        plateNumber: readText(
          formData,
          "plateNumber",
          "Biển số",
          20,
        ).toUpperCase(),
        vehicleType: readText(formData, "vehicleType", "Loại xe", 80),
        homeWarehouseId: readIdentifier(
          formData,
          "homeWarehouseId",
          "Kho chính",
          true,
        ),
        maxPayloadKg: readPositiveDecimal(
          formData,
          "maxPayloadKg",
          "Tải trọng",
          true,
        ),
        maxVolumeM3: readPositiveDecimal(
          formData,
          "maxVolumeM3",
          "Thể tích",
          true,
        ),
      };
    case "vehicle-load-profile": {
      const materialId = readIdentifier(
        formData,
        "materialId",
        "Vật liệu",
        true,
      );
      const materialGroupId = readIdentifier(
        formData,
        "materialGroupId",
        "Nhóm vật liệu",
        true,
      );
      if (Boolean(materialId) === Boolean(materialGroupId)) {
        return invalid(
          "Hồ sơ tải phải chọn đúng một vật liệu hoặc một nhóm vật liệu.",
        );
      }
      return {
        kind,
        vehicleId: readIdentifier(formData, "vehicleId", "Phương tiện")!,
        materialId,
        materialGroupId,
        plannedQuantity: readPositiveDecimal(
          formData,
          "plannedQuantity",
          "Sức chở kế hoạch",
        )!,
        uomId: readIdentifier(formData, "uomId", "Đơn vị")!,
        notes: readOptionalText(formData, "notes"),
      };
    }
    case "employee-profile":
      return {
        kind,
        userId: readIdentifier(formData, "userId", "Nhân viên")!,
        employeeCode: readCode(formData, "employeeCode"),
        homeWarehouseId: readIdentifier(
          formData,
          "homeWarehouseId",
          "Kho chính",
          true,
        ),
        jobTitle: readOptionalText(formData, "jobTitle", 120),
      };
    case "worker-skill":
      return {
        kind,
        code: readCode(formData),
        name: readText(formData, "name", "Tên kỹ năng"),
        description: readOptionalText(formData, "description"),
      };
    case "worker-skill-assignment": {
      const level = readText(
        formData,
        "level",
        "Mức kỹ năng",
      ) as WorkerSkillLevel;
      if (!WORKER_SKILL_LEVELS.includes(level))
        return invalid("Mức kỹ năng không hợp lệ.");
      return {
        kind,
        userId: readIdentifier(formData, "userId", "Nhân viên")!,
        skillId: readIdentifier(formData, "skillId", "Kỹ năng")!,
        level,
      };
    }
    default:
      return invalid("Loại dữ liệu master không được hỗ trợ.");
  }
}

const TOGGLEABLE_KINDS: ToggleableMasterEntity[] = [
  "material-group",
  "uom",
  "material",
  "warehouse",
  "vehicle",
  "vehicle-load-profile",
  "employee-profile",
  "worker-skill",
];

export function parseToggleMasterDataForm(
  formData: FormData,
): ToggleMasterDataInput {
  const kind = readText(
    formData,
    "kind",
    "Loại dữ liệu",
  ) as ToggleableMasterEntity;
  if (!TOGGLEABLE_KINDS.includes(kind)) {
    return invalid("Loại dữ liệu không hỗ trợ đổi trạng thái.");
  }
  return {
    kind,
    id: readIdentifier(formData, "id", "Bản ghi")!,
    isActive: readText(formData, "isActive", "Trạng thái") === "true",
  };
}
