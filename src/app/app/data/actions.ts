"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  parseSaveMasterDataForm,
  parseToggleMasterDataForm,
} from "@/modules/master-data/commands";
import {
  saveMasterData,
  toggleMasterData,
} from "@/modules/master-data/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";

export interface MasterDataActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

function actionError(
  error: unknown,
  idempotencyKey: string,
): MasterDataActionState {
  return {
    status: "error",
    message:
      error instanceof PlatformError
        ? error.message
        : "Không thể lưu dữ liệu. Hãy kiểm tra các trường và thử lại.",
    idempotencyKey,
  };
}

export async function saveMasterDataAction(
  previousState: MasterDataActionState,
  formData: FormData,
): Promise<MasterDataActionState> {
  const idempotencyValue = formData.get("idempotencyKey");
  const idempotencyKey =
    typeof idempotencyValue === "string" && idempotencyValue
      ? idempotencyValue
      : previousState.idempotencyKey;

  try {
    const principal = await getCurrentPrincipal("office");
    if (!principal) {
      throw new PlatformError(
        "Bạn cần đăng nhập để tiếp tục.",
        "AUTHENTICATION_REQUIRED",
        401,
      );
    }
    const input = parseSaveMasterDataForm(formData);
    await saveMasterData(principal, idempotencyKey, input);
    revalidatePath("/app/data");
    return {
      status: "success",
      message: "Đã lưu và ghi nhận audit thành công.",
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return actionError(error, idempotencyKey);
  }
}

export async function toggleMasterDataAction(
  formData: FormData,
): Promise<void> {
  const idempotencyValue = formData.get("idempotencyKey");
  if (typeof idempotencyValue !== "string") return;
  const principal = await getCurrentPrincipal("office");
  if (!principal) return;
  const input = parseToggleMasterDataForm(formData);
  await toggleMasterData(principal, idempotencyValue, input);
  revalidatePath("/app/data");
}
