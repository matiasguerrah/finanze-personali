/** "Dividi": split one transaction into a personal and a business part. */
import { applyBp, assertInt, BP_100 } from './money';

export interface SplitResult {
  personalCents: number;
  businessCents: number;
}

/** Business part given as an amount; the personal part gets the rest. Both parts must be > 0. */
export function splitByAmount(totalCents: number, businessCents: number): SplitResult | null {
  assertInt(totalCents, 'totalCents');
  assertInt(businessCents, 'businessCents');
  if (businessCents <= 0 || businessCents >= totalCents) return null;
  return { personalCents: totalCents - businessCents, businessCents };
}

/** Business part given as a percentage (bp); rounding goes to business, the rest to personal. */
export function splitByPercent(totalCents: number, businessBp: number): SplitResult | null {
  assertInt(businessBp, 'businessBp');
  if (businessBp <= 0 || businessBp >= BP_100) return null;
  return splitByAmount(totalCents, applyBp(totalCents, businessBp));
}
