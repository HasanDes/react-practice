// Deterministic product seed. The same seed always produces the same 5,000
// products, so ids, prices and names are stable across reloads, machines and
// test runs. Bug reports and test assertions can refer to "p-0042" safely.

import { CATEGORIES } from "../contract.ts";
import type { Category, Cents, Product } from "../../types/api.ts";

type Random = () => number;
/** At least one element, so picking from it always yields a value. */
type NonEmpty<T> = readonly [T, ...T[]];

const SEED = 20261121;

/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
function createRandom(seed: number): Random {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATALOG: Record<
  Category,
  { adjectives: NonEmpty<string>; nouns: NonEmpty<string>; priceCents: readonly [Cents, Cents] }
> = {
  keyboards: {
    adjectives: [
      "Clicky",
      "Silent",
      "Tenkeyless",
      "Split",
      "Ortholinear",
      "Low-Profile",
      "Hot-Swap",
      "Retro",
      "Wireless",
      "Compact",
    ],
    nouns: ["Keyboard", "Mechanical Keyboard", "Keeb", "60% Board", "75% Board"],
    priceCents: [4999, 24999],
  },
  ducks: {
    adjectives: [
      "Debug",
      "Classic Rubber",
      "Pirate",
      "Ninja",
      "Zen",
      "Senior Engineer",
      "Intern",
      "Galaxy",
      "Golden",
      "Glow-in-the-Dark",
    ],
    nouns: ["Duck", "Duck XL", "Mini Duck", "Duck Duo"],
    priceCents: [499, 2499],
  },
  coffee: {
    adjectives: [
      "Dark Roast",
      "Espresso",
      "Cold Brew",
      "Decaf",
      "Sprint",
      "Deploy Day",
      "Hotfix",
      "Midnight Oil",
      "Standup",
      "Refactor",
    ],
    nouns: ["Beans", "Blend", "Pods", "Ground Coffee"],
    priceCents: [899, 3499],
  },
  stickers: {
    adjectives: [
      "404",
      "Works on My Machine",
      "LGTM",
      "Semicolon",
      "Git Blame",
      "Null Pointer",
      "Tabs vs Spaces",
      "sudo",
      "Merge Conflict",
      "It's a Feature",
    ],
    nouns: ["Sticker", "Sticker Pack", "Holo Sticker", "Laptop Decal"],
    priceCents: [199, 999],
  },
};

function pick<T>(random: Random, list: NonEmpty<T>): T {
  // The fallback is unreachable (index is always in range) but satisfies noUncheckedIndexedAccess.
  return list[Math.floor(random() * list.length)] ?? list[0];
}

/** Random price in range, ending in 99 cents like a real shop. */
function priceInRange(random: Random, [min, max]: readonly [Cents, Cents]): Cents {
  const dollars = Math.floor((min + random() * (max - min)) / 100);
  return dollars * 100 + 99;
}

/** ~12% sold out, ~15% low stock (1–5), the rest 6–200. */
function stockLevel(random: Random): number {
  const roll = random();
  if (roll < 0.12) return 0;
  if (roll < 0.27) return 1 + Math.floor(random() * 5);
  return 6 + Math.floor(random() * 195);
}

export function generateProducts(count = 5000): Product[] {
  const random = createRandom(SEED);
  const products: Product[] = [];

  for (let i = 1; i <= count; i += 1) {
    const category = pick(random, CATEGORIES);
    const { adjectives, nouns, priceCents } = CATALOG[category];
    const id = `p-${String(i).padStart(4, "0")}`;

    products.push({
      id,
      // The model number keeps names unique enough to tell items apart in a 409 message.
      name: `${pick(random, adjectives)} ${pick(random, nouns)} #${i}`,
      price: priceInRange(random, priceCents),
      category,
      stock: stockLevel(random),
      rating: Math.round((2.5 + random() * 2.5) * 10) / 10,
      imageUrl: `/images/products/${category}.svg`,
    });
  }

  return products;
}
