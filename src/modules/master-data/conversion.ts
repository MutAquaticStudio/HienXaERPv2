import {
  CONVERSION_METHODS,
  type ConversionMethod,
  type UomDimension,
} from "@/modules/master-data/types";

export interface ConversionDefinition {
  sourceQuantity: string;
  targetQuantity: string;
  method: ConversionMethod;
  roundingScale: number;
  sourceDimension: UomDimension;
  targetDimension: UomDimension;
}

export interface ConversionResult {
  quantity: string;
  method: ConversionMethod;
  methodLabel: string;
  precisionNotice: string | null;
}

interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

const METHOD_LABELS: Record<ConversionMethod, string> = {
  EXACT: "Chính xác",
  PACKAGING: "Quy cách riêng của vật liệu",
  ESTIMATED: "Ước tính",
  MEASURED: "Theo số đo thực tế",
};

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a || 1n;
}

function normalize(fraction: Fraction): Fraction {
  const divisor = greatestCommonDivisor(
    fraction.numerator,
    fraction.denominator,
  );
  return {
    numerator: fraction.numerator / divisor,
    denominator: fraction.denominator / divisor,
  };
}

function parsePositiveDecimal(value: string, fieldName: string): Fraction {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`${fieldName} phải là số thập phân dương.`);
  }
  const [whole = "0", decimal = ""] = normalized.split(".");
  const denominator = 10n ** BigInt(decimal.length);
  const numerator = BigInt(`${whole}${decimal}`);
  if (numerator <= 0n) {
    throw new Error(`${fieldName} phải lớn hơn 0.`);
  }
  return normalize({ numerator, denominator });
}

function multiply(...fractions: Fraction[]): Fraction {
  return normalize(
    fractions.reduce<Fraction>(
      (result, item) => ({
        numerator: result.numerator * item.numerator,
        denominator: result.denominator * item.denominator,
      }),
      { numerator: 1n, denominator: 1n },
    ),
  );
}

function roundFraction(fraction: Fraction, scale: number): string {
  const multiplier = 10n ** BigInt(scale);
  const scaledNumerator = fraction.numerator * multiplier;
  let quotient = scaledNumerator / fraction.denominator;
  const remainder = scaledNumerator % fraction.denominator;
  if (remainder * 2n >= fraction.denominator) quotient += 1n;

  if (scale === 0) return quotient.toString();
  const padded = quotient.toString().padStart(scale + 1, "0");
  const whole = padded.slice(0, -scale);
  const decimal = padded.slice(-scale).replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : whole;
}

export function assertConversionDefinition(
  definition: ConversionDefinition,
): void {
  parsePositiveDecimal(definition.sourceQuantity, "Số lượng nguồn");
  parsePositiveDecimal(definition.targetQuantity, "Số lượng quy đổi");
  if (!CONVERSION_METHODS.includes(definition.method)) {
    throw new Error("Phương pháp quy đổi không hợp lệ.");
  }
  if (!Number.isInteger(definition.roundingScale)) {
    throw new Error("Số chữ số làm tròn phải là số nguyên.");
  }
  if (definition.roundingScale < 0 || definition.roundingScale > 6) {
    throw new Error("Số chữ số làm tròn phải từ 0 đến 6.");
  }
  if (
    definition.method === "EXACT" &&
    definition.sourceDimension !== definition.targetDimension
  ) {
    throw new Error("Quy đổi khác loại đơn vị không được ghi là chính xác.");
  }
}

export function convertQuantity(
  quantity: string,
  definition: ConversionDefinition,
  direction: "TO_BASE" | "FROM_BASE" = "TO_BASE",
): ConversionResult {
  assertConversionDefinition(definition);
  const input = parsePositiveDecimal(quantity, "Số lượng cần đổi");
  const source = parsePositiveDecimal(
    definition.sourceQuantity,
    "Số lượng nguồn",
  );
  const target = parsePositiveDecimal(
    definition.targetQuantity,
    "Số lượng quy đổi",
  );
  const ratio =
    direction === "TO_BASE"
      ? {
          numerator: target.numerator * source.denominator,
          denominator: target.denominator * source.numerator,
        }
      : {
          numerator: source.numerator * target.denominator,
          denominator: source.denominator * target.numerator,
        };
  const result = multiply(input, ratio);

  return {
    quantity: roundFraction(result, definition.roundingScale),
    method: definition.method,
    methodLabel: METHOD_LABELS[definition.method],
    precisionNotice:
      definition.method === "ESTIMATED"
        ? "Kết quả chỉ dùng để ước tính, không phải tỷ lệ chính xác."
        : definition.method === "MEASURED"
          ? "Kết quả phụ thuộc số đo thực tế đã ghi nhận."
          : null,
  };
}
