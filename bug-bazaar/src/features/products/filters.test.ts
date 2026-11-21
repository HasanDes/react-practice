import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  hasActiveFilters,
  parseFilters,
  toSearchParams,
  type ProductFilters,
} from "./filters.ts";

const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe("parseFilters / toSearchParams", () => {
  it("round-trips: URL → filters → URL is identical (links are reproducible)", () => {
    const query = "search=duck&category=ducks&inStock=true&sort=price-asc&page=3";
    expect(toSearchParams(parse(query)).toString()).toBe(query);
  });

  it("omits defaults, so the unfiltered list is a bare URL", () => {
    expect(toSearchParams(DEFAULT_FILTERS).toString()).toBe("");
    expect(toSearchParams({ ...DEFAULT_FILTERS, category: "coffee" }).toString()).toBe(
      "category=coffee",
    );
  });

  it("produces one canonical URL regardless of param order", () => {
    const a = toSearchParams(parse("sort=name-asc&category=stickers")).toString();
    const b = toSearchParams(parse("category=stickers&sort=name-asc")).toString();
    expect(a).toBe(b);
  });

  it("ignores invalid or hand-edited values instead of breaking", () => {
    expect(parse("category=bogus&sort=cheapest&page=-2&inStock=yes")).toEqual(DEFAULT_FILTERS);
    expect(parse("page=abc").page).toBe(1);
    expect(parse("search=%20%20duck%20").search).toBe("duck");
  });

  it("hasActiveFilters ignores the page number", () => {
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, page: 4 })).toBe(false);
    const filtered: ProductFilters = { ...DEFAULT_FILTERS, inStock: true };
    expect(hasActiveFilters(filtered)).toBe(true);
  });
});
