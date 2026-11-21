// Shared test queries that read the page the way users do (D4-5).

import { screen } from "@testing-library/react";

/**
 * The number of items in the cart, read from the header cart link's
 * accessible name ("Cart, 3 items"): what a screen reader announces, and
 * the same number the badge shows. No test ids, no DOM structure.
 */
export function cartCount(): number {
  let count = Number.NaN;
  screen.getByRole("link", {
    name: (name) => {
      const match = /^Cart, (\d+) items?$/.exec(name);
      if (match) count = Number(match[1]);
      return match !== null;
    },
  });
  return count;
}
