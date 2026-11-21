// LEGACY (Week 1 board): a fake in-memory source that fails ~1 in 4 times on
// purpose. It isn't part of the store contract and has no HTTP endpoint, but
// it lives in the data layer so no component reaches for data on its own.
// Deleted when the board is replaced by the product grid (D2-1).

import type { Bug } from "../features/bugs/types.ts";

const BUGS: readonly Bug[] = [
  { id: 1, title: "Login button overlaps footer", severity: "Low" },
  { id: 2, title: "Checkout total is wrong", severity: "High" },
  { id: 3, title: "Search ignores capital letters", severity: "Medium" },
];

export function getBugs(): Promise<Bug[]> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.25) {
        reject(new Error("The bug server is hiding"));
      } else {
        resolve([...BUGS]);
      }
    }, 800);
  });
}
