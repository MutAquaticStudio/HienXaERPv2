import { AppError } from "@/lib/core/errors";
import { type Vnd, addVnd, subtractVnd, vnd } from "@/lib/core/money";

export type CreditExposure = Readonly<{
  receivableVnd: Vnd;
  commitmentVnd: Vnd;
  eligibleReservedAdvanceVnd: Vnd;
  exposureVnd: Vnd;
}>;

export function calculateCreditExposure(input: {
  receivableVnd: Vnd;
  commitmentVnd: Vnd;
  eligibleReservedAdvanceVnd?: Vnd;
}): CreditExposure {
  const advance = input.eligibleReservedAdvanceVnd ?? vnd("0");
  const exposure = subtractVnd(addVnd(input.receivableVnd, input.commitmentVnd), advance);
  if (exposure < BigInt(0)) throw new AppError({ code: "VALIDATION_FAILED", message: "Dư nợ dùng tính hạn mức không thể âm.", status: 422 });
  return { receivableVnd: input.receivableVnd, commitmentVnd: input.commitmentVnd, eligibleReservedAdvanceVnd: advance, exposureVnd: exposure };
}

export function assertCreditAvailable(input: { exposureVnd: Vnd; requestedVnd: Vnd; approvedLimitVnd?: Vnd }): void {
  if (input.approvedLimitVnd === undefined) throw new AppError({ code: "CONFLICT", message: "Hạn mức chưa được duyệt.", status: 409 });
  if (addVnd(input.exposureVnd, input.requestedVnd) > input.approvedLimitVnd) {
    throw new AppError({ code: "CONFLICT", message: "Giao dịch vượt hạn mức tín dụng.", status: 409 });
  }
}
