// How the catalog uses the query cache (D3-5). Why these numbers, and when
// stale data is acceptable: docs/decisions.md (D3-5).

import { queryCache, type QueryCache } from "../../cache/queryCache.ts";
import type { Product } from "../../types/api.ts";

/**
 * Product lists and details: reused as is for 30 s, then shown at once and
 * refreshed in the background. Names, prices and images rarely change. Stock
 * does, but a slightly old number is safe: the cart caps quantities at the
 * stock it knows, and the server has the final word at checkout (409).
 */
export const CATALOG_STALE_MS = 30_000;

/** Related products are suggestions: a few minutes old is fine. */
export const RELATED_STALE_MS = 5 * 60_000;

export const listKey = (query: string) => `products:${query}`;
export const productKey = (id: string) => `product:${id}`;
export const relatedKey = (category: string, id: string) => `related:${category}:${id}`;

/**
 * A product list already contains every field the details page shows, so
 * each listed product is cached under its details key too. Opening a product
 * from the list then shows it instantly instead of a loading skeleton.
 */
export function seedProducts(products: readonly Product[], cache: QueryCache = queryCache): void {
  for (const product of products) cache.set(productKey(product.id), product);
}

/**
 * Stock for these products just changed (an order went through, or a 409
 * told us it was lower than we thought). Drop every cached entry that shows
 * any of them, lists, details and related products, so the next visit
 * fetches the real numbers instead of showing what was true before.
 * Entries that don't show them are kept: their data is still as good as it was.
 */
export function forgetProducts(ids: Iterable<string>, cache: QueryCache = queryCache): number {
  const changed = new Set(ids);
  return cache.removeWhere((_key, data) => showsAny(data, changed));
}

function hasId(value: unknown, ids: ReadonlySet<string>): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    ids.has(value.id)
  );
}

/** Product (details), Product[] (related) or { items: Product[] } (a list page). */
function showsAny(data: unknown, ids: ReadonlySet<string>): boolean {
  if (Array.isArray(data)) return data.some((item) => hasId(item, ids));
  if (typeof data === "object" && data !== null && "items" in data && Array.isArray(data.items)) {
    return data.items.some((item) => hasId(item, ids));
  }
  return hasId(data, ids);
}
