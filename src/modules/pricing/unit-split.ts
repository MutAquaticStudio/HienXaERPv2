import Decimal from "decimal.js";
import { formatQuantity } from "@/lib/core/quantity";
import type { RoundingStep } from "./bulk-adjust";

/** A selling unit of one material: 1 unit = numerator / denominator base units. The base unit itself is 1/1. */
export type UnitRatio = { uomId: string; numerator: string; denominator: string };

const MAX_VND = 9223372036854775807n;

export function baseUnitsPerUnit(unit: UnitRatio): Decimal {
  return new Decimal(unit.numerator).div(unit.denominator);
}

/**
 * Suggested prices for every unit from the price of one unit, by the conversion ratios (D11 "giá lẻ tự chia"):
 * tấn 6.000.000 with 1 tấn = 1.000 kg and 1 bao = 50 kg → kg 6.000, bao 300.000. Each suggestion is rounded half-up
 * to the step; a unit whose suggestion is not a positive VND amount is left out. Only a calculator: the saved price
 * of each unit is still the absolute VND amount the user confirms.
 */
export function splitPriceByUnits(from: UnitRatio, priceVnd: bigint, units: UnitRatio[], step: RoundingStep): Map<string, bigint> {
  const perBase = new Decimal(priceVnd.toString()).div(baseUnitsPerUnit(from));
  const result = new Map<string, bigint>();
  for (const unit of units) {
    if (unit.uomId === from.uomId) { result.set(unit.uomId, priceVnd); continue; }
    const rounded = perBase.mul(baseUnitsPerUnit(unit)).div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).mul(step);
    if (rounded.lte(0)) continue;
    const value = BigInt(rounded.toFixed(0));
    if (value <= MAX_VND) result.set(unit.uomId, value);
  }
  return result;
}

/** Cost of one unit from the average cost of one base unit, display-rounded to whole đồng. */
export function unitCostVnd(costPerBaseVnd: string, unit: UnitRatio): bigint {
  return BigInt(new Decimal(costPerBaseVnd).mul(baseUnitsPerUnit(unit)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

/** "50" → { numerator: "50", denominator: "1" }; the ratio is typed as base units per unit (Vietnamese decimals allowed upstream). */
export function ratioFromDecimal(value: string): { numerator: string; denominator: string } {
  return { numerator: new Decimal(value).toFixed(), denominator: "1" };
}

/** How a selling unit is typed (Owner 18/10): "1 bao = 50 kg" (UNIT_TO_BASE) or "1 tấn = 20 bao" (BASE_TO_UNIT). */
export type RatioDirection = "UNIT_TO_BASE" | "BASE_TO_UNIT";

/**
 * The stored ratio (1 unit = numerator / denominator base units) from the typed number, or null when it cannot be used:
 * not above 0, more than 6 decimals, or a "1 base = x units" whose one unit is not an exact base amount to 6 decimals
 * (1 tấn = 3 bao would make 1 bao = 0,333… tấn, and orders in bao could not be counted exactly).
 */
export function ratioFromDirection(value: string, direction: RatioDirection): { numerator: string; denominator: string } | null {
  let typed: Decimal;
  try { typed = new Decimal(value); } catch { return null; }
  if (!typed.isFinite() || typed.lte(0) || typed.decimalPlaces() > 6) return null;
  if (direction === "UNIT_TO_BASE") return { numerator: typed.toFixed(), denominator: "1" };
  const perUnit = new Decimal(1).div(typed);
  return perUnit.toDecimalPlaces(6).eq(perUnit) ? { numerator: "1", denominator: typed.toFixed() } : null;
}

function ratioText(value: Decimal) {
  const exact = value.toDecimalPlaces(6);
  return `${exact.eq(value) ? "" : "≈ "}${formatQuantity(exact.toFixed())}`;
}

/**
 * A conversion "1 from = numerator / denominator to" as words both ways, the way with a number of 1 or more first:
 * Tấn → Bao 20/1 reads "1 Tấn = 20 Bao" (other: "1 Bao = 0,05 Tấn"), never "20 / 1".
 */
export function conversionSentences(fromSymbol: string, toSymbol: string, numerator: string, denominator: string): { main: string; other: string } {
  const ratio = new Decimal(numerator).div(denominator);
  const forward = `1 ${fromSymbol} = ${ratioText(ratio)} ${toSymbol}`;
  const reverse = `1 ${toSymbol} = ${ratioText(new Decimal(1).div(ratio))} ${fromSymbol}`;
  return ratio.gte(1) ? { main: forward, other: reverse } : { main: reverse, other: forward };
}
