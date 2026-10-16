import Decimal from "decimal.js";
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
