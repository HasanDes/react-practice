// Pure search / filter / sort / paginate logic for GET /api/products.
// Kept separate from the HTTP handler so it can be unit-tested directly.

import {
  isCategory,
  isSortOption,
  type Category,
  type Product,
  type ProductListResponse,
  type SortOption,
} from "../types/api.ts";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "./contract.ts";

/** Fully-resolved query: every field has a concrete value after parsing. */
export type ParsedProductQuery = {
  search: string;
  category: Category | null;
  sort: SortOption;
  inStock: boolean;
  page: number;
  pageSize: number;
};

/**
 * Parse raw query-string values into safe, normalized params.
 * Invalid values fall back to defaults rather than erroring, because the
 * contract only lists 500 for this endpoint.
 */
export function parseProductQuery(searchParams: URLSearchParams): ParsedProductQuery {
  const search = (searchParams.get("search") ?? "").trim().toLowerCase();

  const rawCategory = searchParams.get("category");
  const category = isCategory(rawCategory) ? rawCategory : null;

  const rawSort = searchParams.get("sort");
  const sort = isSortOption(rawSort) ? rawSort : "relevance";

  const inStock = searchParams.get("inStock") === "true";

  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const rawSize = Number.parseInt(searchParams.get("pageSize") ?? "", 10);
  const pageSize = Number.isFinite(rawSize)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, rawSize))
    : DEFAULT_PAGE_SIZE;

  return { search, category, sort, inStock, page, pageSize };
}

type Comparator = (a: Product, b: Product) => number;

const COMPARATORS: Record<Exclude<SortOption, "relevance">, Comparator> = {
  "price-asc": (a, b) => a.price - b.price,
  "price-desc": (a, b) => b.price - a.price,
  "rating-desc": (a, b) => b.rating - a.rating,
  "name-asc": (a, b) => a.name.localeCompare(b.name),
};

export function queryProducts(
  products: readonly Product[],
  { search, category, sort, inStock, page, pageSize }: ParsedProductQuery,
): ProductListResponse {
  let result = products.filter(
    (product) =>
      (!search || product.name.toLowerCase().includes(search)) &&
      (!category || product.category === category) &&
      (!inStock || product.stock > 0),
  );

  if (sort !== "relevance") {
    const compare = COMPARATORS[sort];
    // Tie-break on id so the order is stable and pages never shuffle between requests.
    result = [...result].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id));
  }

  const start = (page - 1) * pageSize;
  return { items: result.slice(start, start + pageSize), total: result.length };
}
