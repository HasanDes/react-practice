import { describe, expect, it } from "vitest";
import { forgetProducts, productKey, seedProducts } from "../features/products/catalogCache.ts";
import type { Product } from "../types/api.ts";
import { createQueryCache } from "./queryCache.ts";

function clockedCache(maxEntries = 100) {
  const clock = { now: 0 };
  return { clock, cache: createQueryCache({ now: () => clock.now, maxEntries }) };
}

describe("queryCache", () => {
  it("stores data with the time it was fetched", () => {
    const { clock, cache } = clockedCache();
    clock.now = 1000;
    cache.set("a", { x: 1 });
    expect(cache.get("a")).toEqual({ data: { x: 1 }, updatedAt: 1000 });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("is fresh until staleTime has passed", () => {
    const { clock, cache } = clockedCache();
    cache.set("a", 1);
    const entry = cache.get("a");
    if (!entry) throw new Error("missing");
    clock.now = 29_999;
    expect(cache.isFresh(entry, 30_000)).toBe(true);
    clock.now = 30_000;
    expect(cache.isFresh(entry, 30_000)).toBe(false);
  });

  it("drops the least recently used entry past maxEntries (reads count as use)", () => {
    const { cache } = clockedCache(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a"); // a is now more recent than b
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.data).toBe(1);
    expect(cache.get("c")?.data).toBe(3);
    expect(cache.size).toBe(2);
  });

  it("removeWhere drops matching entries and keeps the rest", () => {
    const { cache } = clockedCache();
    cache.set("keep", 1);
    cache.set("drop", 2);
    expect(cache.removeWhere((_key, data) => data === 2)).toBe(1);
    expect(cache.get("drop")).toBeUndefined();
    expect(cache.get("keep")?.data).toBe(1);
  });
});

const product = (id: string): Product => ({
  id,
  name: `Product ${id}`,
  price: 100,
  category: "ducks",
  stock: 5,
  rating: 4,
  imageUrl: "/x.svg",
});

describe("catalog cache helpers", () => {
  it("seedProducts caches each listed product under its details key", () => {
    const { cache } = clockedCache();
    seedProducts([product("p-1"), product("p-2")], cache);
    expect(cache.get(productKey("p-2"))?.data).toEqual(product("p-2"));
  });

  it("forgetProducts drops details, related lists and list pages that show a changed product", () => {
    const { cache } = clockedCache();
    cache.set("product:p-1", product("p-1"));
    cache.set("product:p-2", product("p-2"));
    cache.set("related:ducks:p-9", [product("p-3"), product("p-1")]);
    cache.set("related:ducks:p-8", [product("p-3")]);
    cache.set("products:page=1", { items: [product("p-1"), product("p-4")], total: 2 });
    cache.set("products:page=2", { items: [product("p-5")], total: 2 });

    expect(forgetProducts(["p-1"], cache)).toBe(3);
    expect(cache.get("product:p-1")).toBeUndefined();
    expect(cache.get("related:ducks:p-9")).toBeUndefined();
    expect(cache.get("products:page=1")).toBeUndefined();
    // Entries that don't show p-1 are still good.
    expect(cache.get("product:p-2")).toBeDefined();
    expect(cache.get("related:ducks:p-8")).toBeDefined();
    expect(cache.get("products:page=2")).toBeDefined();
  });
});
