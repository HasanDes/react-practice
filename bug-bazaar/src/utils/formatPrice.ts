import type { Cents } from "../types/api.ts";

// Created once. Intl formatters are relatively expensive to construct, and
// this one runs for every card in the grid.
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * The one place integer cents become display text. 1999 → "$19.99".
 *
 * Money stays in integer cents everywhere else (state, math, API), because
 * floats can't represent most decimal fractions exactly: 0.1 + 0.2 !== 0.3.
 * Converting only at render time means rounding errors can't build up.
 */
export function formatPrice(cents: Cents): string {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`formatPrice expects integer cents, got ${String(cents)}`);
  }
  return usd.format(cents / 100);
}
