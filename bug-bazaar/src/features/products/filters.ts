// Product filters <-> URL search params.
//
// The URL is the single source of truth for what the product list shows.
// That one decision gives the D2-2 "Done when" for free:
//   - refresh keeps the view (the URL survives a reload)
//   - a copied link reproduces it (the URL *is* the view)
//   - Back/Forward work (each change is a history entry)
// These are pure functions, so they're trivially unit-testable.

import {
  isCategory,
  isSortOption,
  type Category,
  type ProductQuery,
  type SortOption,
} from "../../types/api.ts";

export type ProductFilters = {
  search: string;
  category: Category | null;
  inStock: boolean;
  sort: SortOption;
  page: number;
};

export const DEFAULT_FILTERS: Readonly<ProductFilters> = {
  search: "",
  category: null,
  inStock: false,
  sort: "relevance",
  page: 1,
};

/**
 * Read filters from the URL. Untrusted input (anyone can edit a URL), so
 * every value is validated, and anything unknown falls back to its default
 * instead of breaking the page.
 */
export function parseFilters(params: URLSearchParams): ProductFilters {
  const category = params.get("category");
  const sort = params.get("sort");
  const page = Number.parseInt(params.get("page") ?? "", 10);

  return {
    search: (params.get("search") ?? "").trim(),
    category: isCategory(category) ? category : null,
    inStock: params.get("inStock") === "true",
    sort: isSortOption(sort) ? sort : DEFAULT_FILTERS.sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/**
 * Write filters to the URL. Defaults are omitted, so the unfiltered list is
 * plain "/", links stay short, and equivalent views always produce the same
 * URL (one canonical form).
 */
export function toSearchParams(filters: ProductFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.inStock) params.set("inStock", "true");
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set("sort", filters.sort);
  if (filters.page > 1) params.set("page", String(filters.page));
  return params;
}

/** Any filter (other than the page) differs from the default. */
export function hasActiveFilters(filters: ProductFilters): boolean {
  return (
    filters.search !== DEFAULT_FILTERS.search ||
    filters.category !== DEFAULT_FILTERS.category ||
    filters.inStock !== DEFAULT_FILTERS.inStock ||
    filters.sort !== DEFAULT_FILTERS.sort
  );
}

/** Map URL filters to the API query for GET /api/products. */
export function toProductQuery(filters: ProductFilters, pageSize: number): ProductQuery {
  return {
    search: filters.search,
    ...(filters.category ? { category: filters.category } : {}),
    sort: filters.sort,
    inStock: filters.inStock,
    page: filters.page,
    pageSize,
  };
}

export const SORT_LABELS: Record<SortOption, string> = {
  relevance: "Featured",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "rating-desc": "Top rated",
  "name-asc": "Name: A to Z",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  keyboards: "Keyboards",
  ducks: "Rubber ducks",
  coffee: "Coffee",
  stickers: "Stickers",
};
