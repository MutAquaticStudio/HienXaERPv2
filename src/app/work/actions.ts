"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { parseDeliveryForm } from "@/modules/delivery/commands";
import { runDeliveryCommand } from "@/modules/delivery/service";
import { PlatformError } from "@/modules/platform/errors";
import { getCurrentPrincipal } from "@/modules/platform/principal";
import { parsePortalIssueForm } from "@/modules/portal-issues/commands";
import { runPortalIssueCommand } from "@/modules/portal-issues/service";
import { parseWorkForm } from "@/modules/workforce/commands";
import { runWorkCommand } from "@/modules/workforce/service";

export interface DriverDeliveryActionState {
  status: "idle" | "success" | "error";
  message: string;
  idempotencyKey: string;
}

export type WorkerWorkActionState = DriverDeliveryActionState;
export type WorkerIssueActionState = DriverDeliveryActionState;

function workErrorMessage(error: unknown) {
  if (error instanceof PlatformError) return error.message;
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (message.includes("WORK_ALREADY_CLAIMED") || code === "23505") {
    return "Công việc vừa được người khác nhận. Danh sách sẽ được làm mới.";
  }
  if (message.includes("WORKER_NOT_ELIGIBLE")) return "Bạn chưa đủ điều kiện hoặc đã đạt giới hạn việc đang làm.";
  if (message.includes("WORK_CLAIM_EXPIRED")) return "Lượt nhận việc đã hết hạn; công việc chưa được bắt đầu.";
  if (message.includes("SUPERVISOR_DECISION_REQUIRED")) return "Cần giám sát xử lý trước khi bạn tiếp tục nhận việc.";
  return "Chưa gửi được. Dữ liệu cũ vẫn được giữ; hãy kiểm tra mạng và thử lại.";
}

export async function runWorkerWorkAction(
  previous: WorkerWorkActionState,
  formData: FormData,
): Promise<WorkerWorkActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("worker");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseWorkForm(formData);
    if (!["work.claim", "work.start", "work.heartbeat", "work.block", "work.complete"].includes(input.kind)) {
      throw new PlatformError("Thao tác này chỉ dành cho giám sát.", "ACCESS_DENIED", 403);
    }
    await runWorkCommand(principal, key, input);
    revalidatePath("/work");
    revalidatePath("/work/pool");
    revalidatePath("/app/workforce");
    let message = "Đã cập nhật công việc.";
    if (input.kind === "work.claim") message = "Đã nhận việc. Hãy bắt đầu trong 5 phút.";
    if (input.kind === "work.start") message = "Đã bắt đầu công việc.";
    if (input.kind === "work.heartbeat") message = "Đã báo tiến độ.";
    if (input.kind === "work.block") message = "Đã báo vướng; giám sát đã được thông báo.";
    if (input.kind === "work.complete") message = "Đã báo hoàn thành; công việc đang chờ xác minh.";
    return { status: "success", message, idempotencyKey: randomUUID() };
  } catch (error) {
    return { status: "error", message: workErrorMessage(error), idempotencyKey: key };
  }
}

export async function runDriverDeliveryAction(
  previous: DriverDeliveryActionState,
  formData: FormData,
): Promise<DriverDeliveryActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("worker");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parseDeliveryForm(formData);
    if (!["delivery.progress", "delivery.proof"].includes(input.kind)) {
      throw new PlatformError("Tài xế không được thực hiện thao tác này.", "ACCESS_DENIED", 403);
    }
    await runDeliveryCommand(principal, key, input);
    revalidatePath("/work");
    revalidatePath("/app/dispatch");
    return {
      status: "success",
      message: input.kind === "delivery.proof" ? "Đã lưu bằng chứng." : "Đã cập nhật chuyến giao.",
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof PlatformError
        ? error.message
        : "Chưa gửi được. Chuyến vẫn giữ trạng thái cũ; hãy thử lại khi có mạng.",
      idempotencyKey: key,
    };
  }
}

export async function runWorkerIssueAction(
  previous: WorkerIssueActionState,
  formData: FormData,
): Promise<WorkerIssueActionState> {
  const submitted = formData.get("idempotencyKey");
  const key = typeof submitted === "string" && submitted ? submitted : previous.idempotencyKey;
  try {
    const principal = await getCurrentPrincipal("worker");
    if (!principal) throw new PlatformError("Bạn cần đăng nhập để tiếp tục.", "AUTHENTICATION_REQUIRED", 401);
    const input = parsePortalIssueForm(formData);
    await runPortalIssueCommand(principal, key, input);
    revalidatePath("/work");
    revalidatePath("/work/service");
    revalidatePath("/app/workforce");
    revalidatePath("/app/dispatch");
    return {
      status: "success",
      message: "Đã gửi sự cố cho giám sát. Công việc gốc chưa bị thay đổi.",
      idempotencyKey: randomUUID(),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof PlatformError
        ? error.message
        : "Chưa gửi được sự cố. Công việc gốc vẫn giữ nguyên; hãy thử lại khi có mạng.",
      idempotencyKey: key,
    };
  }
}
