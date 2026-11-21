// Week 1 bug-board mock (fails ~1 in 4 on purpose). Removed when the board is
// replaced by the product grid in Day 2.

import type { Bug } from "../features/bugs/types.ts";

const BUGS: readonly Bug[] = [
  { id: 1, title: "Login button overlaps footer", severity: "Low" },
  { id: 2, title: "Checkout total is wrong", severity: "High" },
  { id: 3, title: "Search ignores capital letters", severity: "Medium" },
];

export function fetchBugs(): Promise<Bug[]> {
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
