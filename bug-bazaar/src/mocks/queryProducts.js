// Pure search / filter / sort / paginate logic for GET /api/products.
// Kept separate from the HTTP handler so it can be unit-tested directly.

import { CATEGORIES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, SORTS } from "./contract.js";

/**
 * Parse raw query-string values into safe, normalized params.
 * Invalid values fall back to defaults rather than erroring, because the
 * contract only lists 500 for this endpoint.
 *
 * @param {URLSearchParams} searchParams
 */
export function parseProductQuery(searchParams) {
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();

  const rawCategory = searchParams.get("category") ?? "";
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : null;

  const rawSort = searchParams.get("sort") ?? "";
  const sort = SORTS.includes(rawSort) ? rawSort : "relevance";

  const inStock = searchParams.get("inStock") === "true";

  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const rawSize = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize = Number.isFinite(rawSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize))
    : DEFAULT_PAGE_SIZE;

  return { search, category, sort, inStock, page, pageSize };
}

const COMPARATORS = {
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  "rating-desc": (a, b) => b.rating - a.rating,
  "name-asc": (a, b) => a.name.localeCompare(b.name),
};

/**
 * @param {import("./contract.js").Product[]} products
 * @param {ReturnType<typeof parseProductQuery>} query
 * @returns {{ items: import("./contract.js").Product[], total: number }}
 */
export function queryProducts(products, { search, category, sort, inStock, page, pageSize }) {
  let result = products.filter(
    (product) =>
      (!search || product.name.toLowerCase().includes(search)) &&
      (!category || product.category === category) &&
      (!inStock || product.stock > 0),
  );

  const compare = COMPARATORS[sort];
  if (compare) {
    // Tie-break on id so the order is stable and pages never shuffle between requests.
    result = [...result].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));
  }

  const start = (page - 1) * pageSize;
  return { items: result.slice(start, start + pageSize), total: result.length };
}
