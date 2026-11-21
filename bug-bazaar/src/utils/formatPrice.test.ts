import { describe, expect, it } from "vitest";
import { formatPrice } from "./formatPrice.ts";

describe("formatPrice", () => {
  it.each([
    [1999, "$19.99"],
    [0, "$0.00"],
    [5, "$0.05"], // not "$0.5" or "$5.00"
    [50, "$0.50"],
    [100, "$1.00"],
    [123456, "$1,234.56"], // thousands separator
    [24999, "$249.99"],
  ])("formats %i cents as %s", (cents, expected) => {
    expect(formatPrice(cents)).toBe(expected);
  });

  it("rejects non-integer input, because it means a dollars/cents mix-up upstream", () => {
    expect(() => formatPrice(19.99)).toThrow(RangeError);
  });

  it("avoids float drift: summing cents, then formatting, is exact", () => {
    // 0.1 + 0.2 in dollars is 0.30000000000000004; in cents it's exactly 30.
    expect(formatPrice(10 + 20)).toBe("$0.30");
  });
});

// ⚠️ D4-6 DEMO ONLY: a deliberately failing test, on the ci-demo/failing-test
// branch. Its pull request must show CI red and the merge blocked. Never merge.
describe("CI demo", () => {
  it("fails on purpose to prove a failing test blocks the merge", () => {
    expect(formatPrice(1999)).toBe("$19.98"); // wrong on purpose: it's $19.99
  });
});
